import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  brandsTable,
  db,
  materialPricesTable,
  materialsTable,
  stockMovementsTable,
  stockTakesTable,
  usersTable,
} from "@workspace/db";
import {
  CreateStockTakeBody,
  CreateStockTakeResponse,
  CreateStockMovementBody,
  CreateStockMovementResponse,
  ListStockLotsResponse,
  ListStockMovementsResponse,
  ListStockSummaryResponse,
  ListStockTakesResponse,
} from "@workspace/api-zod";
import { requireAnyRole, requireRole } from "../middlewares/auth";
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();
const canManageStock = requireRole("admin", "warehouse", "painter");

function signedQuantity(movementType: "in" | "out" | "adjustment" | "return_to_stock", quantityL: number): number {
  return movementType === "out" ? -quantityL : quantityL;
}

class StockMovementError extends Error {}
class StockTakeConflictError extends Error {}

function dateOnly(value: Date | string | null) {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

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

router.get("/stock/lots", requireAnyRole, async (_req, res): Promise<void> => {
  const rows = await db.select({
    materialId: materialsTable.id,
    materialDescription: materialsTable.description,
    brandName: brandsTable.name,
    movementType: stockMovementsTable.movementType,
    quantityL: stockMovementsTable.quantityL,
    lotNo: stockMovementsTable.lotNo,
    expiryDate: stockMovementsTable.expiryDate,
  }).from(stockMovementsTable)
    .innerJoin(materialsTable, eq(stockMovementsTable.materialId, materialsTable.id))
    .innerJoin(brandsTable, eq(materialsTable.brandId, brandsTable.id))
    .where(eq(materialsTable.isActive, true))
    .orderBy(asc(materialsTable.description), asc(stockMovementsTable.createdAt));

  const lots = new Map<string, {
    materialId: number;
    materialDescription: string;
    brandName: string;
    lotNo: string | null;
    expiryDate: string | null;
    stockL: number;
  }>();
  for (const row of rows) {
    const expiryDate = dateOnly(row.expiryDate);
    const key = JSON.stringify([row.materialId, row.lotNo, expiryDate]);
    const lot = lots.get(key) ?? {
      materialId: row.materialId,
      materialDescription: row.materialDescription,
      brandName: row.brandName,
      lotNo: row.lotNo,
      expiryDate,
      stockL: 0,
    };
    lot.stockL += signedQuantity(row.movementType, row.quantityL);
    lots.set(key, lot);
  }
  res.json(ListStockLotsResponse.parse([...lots.values()].map((lot) => ({
    ...lot,
    stockL: Math.round(lot.stockL * 10000) / 10000,
  }))));
});

async function serializeStockTake(id: number) {
  const [row] = await db.select({
    take: stockTakesTable,
    materialDescription: materialsTable.description,
    brandName: brandsTable.name,
    movementType: stockMovementsTable.movementType,
    actor: usersTable,
  }).from(stockTakesTable)
    .innerJoin(materialsTable, eq(stockTakesTable.materialId, materialsTable.id))
    .innerJoin(brandsTable, eq(materialsTable.brandId, brandsTable.id))
    .leftJoin(stockMovementsTable, eq(stockTakesTable.movementId, stockMovementsTable.id))
    .leftJoin(usersTable, eq(stockTakesTable.countedByUserId, usersTable.id))
    .where(eq(stockTakesTable.id, id));
  if (!row) return null;
  return {
    id: row.take.id,
    materialId: row.take.materialId,
    materialDescription: row.materialDescription,
    brandName: row.brandName,
    lotNo: row.take.lotNo,
    expiryDate: row.take.expiryDate,
    systemQuantityL: row.take.systemQuantityL,
    physicalQuantityL: row.take.physicalQuantityL,
    varianceL: row.take.varianceL,
    movementId: row.take.movementId,
    movementType: row.movementType === "adjustment" ? "return_to_stock" : row.movementType,
    notes: row.take.notes,
    countedByUserId: row.take.countedByUserId,
    countedByName: row.actor?.name ?? row.actor?.username ?? null,
    createdAt: row.take.createdAt,
  };
}

router.get("/stock/takes", requireAnyRole, async (_req, res): Promise<void> => {
  const ids = await db.select({ id: stockTakesTable.id })
    .from(stockTakesTable)
    .orderBy(desc(stockTakesTable.createdAt), desc(stockTakesTable.id));
  const takes = await Promise.all(ids.map(({ id }) => serializeStockTake(id)));
  res.json(ListStockTakesResponse.parse(takes.filter((take): take is NonNullable<typeof take> => take !== null)));
});

router.post("/stock/takes", canManageStock, async (req, res): Promise<void> => {
  const parsed = CreateStockTakeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const lotNo = parsed.data.lotNo?.trim() || null;
  const expiryDate = dateOnly(parsed.data.expiryDate ?? null);
  let takeId: number;
  try {
    takeId = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(914, ${parsed.data.materialId})`);
      const [material] = await tx.select({ id: materialsTable.id, isActive: materialsTable.isActive })
        .from(materialsTable).where(eq(materialsTable.id, parsed.data.materialId));
      if (!material || !material.isActive) {
        throw new StockTakeConflictError("Material not found or inactive");
      }
      const lotConditions = [
        eq(stockMovementsTable.materialId, parsed.data.materialId),
        lotNo === null ? isNull(stockMovementsTable.lotNo) : eq(stockMovementsTable.lotNo, lotNo),
        expiryDate === null
          ? isNull(stockMovementsTable.expiryDate)
          : eq(stockMovementsTable.expiryDate, new Date(`${expiryDate}T00:00:00.000Z`)),
      ];
      const movements = await tx.select({
        movementType: stockMovementsTable.movementType,
        quantityL: stockMovementsTable.quantityL,
      }).from(stockMovementsTable).where(and(...lotConditions));
      const systemQuantityL = Math.round(movements.reduce(
        (total, movement) => total + signedQuantity(movement.movementType, movement.quantityL),
        0,
      ) * 10000) / 10000;
      const physicalQuantityL = parsed.data.physicalQuantityL;
      const varianceL = Math.round((physicalQuantityL - systemQuantityL) * 10000) / 10000;
      const [take] = await tx.insert(stockTakesTable).values({
        materialId: parsed.data.materialId,
        lotNo,
        expiryDate,
        systemQuantityL,
        physicalQuantityL,
        varianceL,
        movementId: null,
        notes: parsed.data.notes?.trim() || null,
        countedByUserId: req.appUser?.id ?? null,
      }).returning({ id: stockTakesTable.id });

      if (Math.abs(varianceL) > 0.00005) {
        const [movement] = await tx.insert(stockMovementsTable).values({
          materialId: parsed.data.materialId,
          movementType: varianceL > 0 ? "return_to_stock" : "out",
          quantityL: Math.abs(varianceL),
          lotNo,
          expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`) : null,
          notes: `Stocktake #${take.id}${parsed.data.notes?.trim() ? ` — ${parsed.data.notes.trim()}` : ""}`,
          createdByUserId: req.appUser?.id ?? null,
        }).returning({ id: stockMovementsTable.id });
        await tx.update(stockTakesTable).set({ movementId: movement.id })
          .where(eq(stockTakesTable.id, take.id));
      }
      return take.id;
    });
  } catch (error) {
    if (error instanceof StockTakeConflictError) {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }

  const saved = await serializeStockTake(takeId);
  if (!saved) {
    res.status(500).json({ error: "Stocktake record could not be loaded after saving" });
    return;
  }
  await recordAudit({
    req,
    action: "create",
    entityType: "stock_take",
    entityId: takeId,
    changes: {
      materialId: saved.materialId,
      lotNo: saved.lotNo,
      expiryDate: saved.expiryDate,
      systemQuantityL: saved.systemQuantityL,
      physicalQuantityL: saved.physicalQuantityL,
      varianceL: saved.varianceL,
      movementId: saved.movementId,
    },
  });
  res.status(201).json(CreateStockTakeResponse.parse(saved));
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