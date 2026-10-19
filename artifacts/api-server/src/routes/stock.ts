import { Router, type IRouter } from "express";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  brandsTable,
  db,
  materialPricesTable,
  materialsTable,
  stockMovementsTable,
  usersTable,
} from "@workspace/db";
import {
  CreateStockMovementBody,
  CreateStockMovementResponse,
  ListStockMovementsResponse,
  ListStockSummaryResponse,
} from "@workspace/api-zod";
import { requireAnyRole, requireRole } from "../middlewares/auth";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();
const canManageStock = requireRole("admin", "warehouse", "painter");

function signedQuantity(movementType: "in" | "out" | "adjustment" | "return_to_stock", quantityL: number): number {
  return movementType === "out" ? -quantityL : quantityL;
}

class StockMovementError extends Error {}

async function serializeMovement(id: number) {
  const [row] = await db
    .select({
      movement: stockMovementsTable,
      material: materialsTable,
      brandName: brandsTable.name,
      actor: usersTable,
    })
    .from(stockMovementsTable)
    .innerJoin(materialsTable, eq(stockMovementsTable.materialId, materialsTable.id))
    .innerJoin(brandsTable, eq(materialsTable.brandId, brandsTable.id))
    .leftJoin(usersTable, eq(stockMovementsTable.createdByUserId, usersTable.id))
    .where(eq(stockMovementsTable.id, id));

  if (!row) return null;
  return {
    id: row.movement.id,
    materialId: row.movement.materialId,
    materialDescription: row.material.description,
    brandName: row.brandName,
    movementType: row.movement.movementType === "adjustment" ? "return_to_stock" : row.movement.movementType,
    quantityL: signedQuantity(row.movement.movementType, row.movement.quantityL),
    lotNo: row.movement.lotNo,
    expiryDate: row.movement.expiryDate,
    notes: row.movement.notes,
    createdByUserId: row.movement.createdByUserId,
    createdByName: row.actor?.name ?? row.actor?.username ?? null,
    createdAt: row.movement.createdAt,
  };
}

router.get("/stock", requireAnyRole, async (_req, res): Promise<void> => {
  const materials = await db
    .select({
      materialId: materialsTable.id,
      materialDescription: materialsTable.description,
      brandName: brandsTable.name,
      packagingSizeL: materialsTable.packagingSizeL,
      deadStockThreshold: materialsTable.deadStockThreshold,
    })
    .from(materialsTable)
    .innerJoin(brandsTable, eq(materialsTable.brandId, brandsTable.id))
    .where(eq(materialsTable.isActive, true))
    .orderBy(asc(materialsTable.description));

  const balances = await db
    .select({
      materialId: stockMovementsTable.materialId,
      stockL: sql<number>`coalesce(sum(case when ${stockMovementsTable.movementType} = 'out' then -${stockMovementsTable.quantityL} else ${stockMovementsTable.quantityL} end), 0)`,
    })
    .from(stockMovementsTable)
    .groupBy(stockMovementsTable.materialId);
  const balanceMap = new Map(balances.map((row) => [row.materialId, Number(row.stockL ?? 0)]));

  const latestPrices = await Promise.all(
    materials.map(async (material) => {
      const [price] = await db
        .select({ unitPrice: materialPricesTable.unitPrice })
        .from(materialPricesTable)
        .where(eq(materialPricesTable.materialId, material.materialId))
        .orderBy(desc(materialPricesTable.effectiveDate), desc(materialPricesTable.createdAt))
        .limit(1);
      return [material.materialId, price?.unitPrice ?? null] as const;
    }),
  );
  const priceMap = new Map(latestPrices);

  res.json(
    ListStockSummaryResponse.parse(
      materials.map((material) => ({
        ...material,
        currentUnitPrice: priceMap.get(material.materialId) ?? null,
        stockL: balanceMap.get(material.materialId) ?? 0,
      })),
    ),
  );
});

router.get("/stock/movements", requireAnyRole, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ id: stockMovementsTable.id })
    .from(stockMovementsTable)
    .orderBy(desc(stockMovementsTable.createdAt), desc(stockMovementsTable.id));
  const movements = await Promise.all(rows.map((row) => serializeMovement(row.id)));
  res.json(ListStockMovementsResponse.parse(movements.filter((movement): movement is NonNullable<typeof movement> => movement !== null)));
});

router.post("/stock/movements", canManageStock, async (req, res): Promise<void> => {
  const parsed = CreateStockMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, parsed.data.materialId));
  if (!material || !material.isActive) {
    res.status(400).json({ error: "Material not found or inactive" });
    return;
  }

  if (parsed.data.quantityL <= 0) {
    res.status(400).json({
      error: "Receipt, issue, and return-to-stock quantities must be greater than zero",
    });
    return;
  }

  let created: { id: number };
  try {
    created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(914, ${parsed.data.materialId})`);
      if (parsed.data.movementType === "out") {
        const movements = await tx.select({
          movementType: stockMovementsTable.movementType,
          quantityL: stockMovementsTable.quantityL,
        }).from(stockMovementsTable).where(eq(stockMovementsTable.materialId, parsed.data.materialId));
        const available = movements.reduce((total, movement) =>
          total + signedQuantity(movement.movementType, movement.quantityL), 0);
        if (parsed.data.quantityL > available + 0.00005) {
          throw new StockMovementError(`Insufficient stock. Available: ${Math.max(available, 0).toFixed(4)} L`);
        }
      }
      const [movement] = await tx.insert(stockMovementsTable)
        .values({ ...parsed.data, createdByUserId: req.appUser?.id ?? null })
        .returning({ id: stockMovementsTable.id });
      return movement;
    });
  } catch (error) {
    if (error instanceof StockMovementError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  await recordAudit({
    req,
    action: "create",
    entityType: "stock_movement",
    entityId: created.id,
    changes: { ...parsed.data },
  });

  const serialized = await serializeMovement(created.id);
  res.status(201).json(CreateStockMovementResponse.parse(serialized));
});

export default router;