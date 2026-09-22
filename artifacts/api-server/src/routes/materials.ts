import { Router, type IRouter } from "express";
import { eq, desc, asc, count, or } from "drizzle-orm";
import {
  db,
  materialsTable,
  materialPricesTable,
  brandsTable,
  stockMovementsTable,
  jobItemsTable,
} from "@workspace/db";
import {
  ListMaterialsResponse,
  CreateMaterialBody,
  CreateMaterialResponse,
  GetMaterialParams,
  GetMaterialResponse,
  UpdateMaterialParams,
  UpdateMaterialBody,
  UpdateMaterialResponse,
  ListMaterialPricesParams,
  ListMaterialPricesResponse,
  CreateMaterialPriceParams,
  CreateMaterialPriceBody,
  CreateMaterialPriceResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireAnyRole } from "../middlewares/auth";
import { recordAudit, diffFields } from "../lib/audit";

const router: IRouter = Router();

const materialColumns = {
  id: materialsTable.id,
  brandId: materialsTable.brandId,
  brandName: brandsTable.name,
  description: materialsTable.description,
  type: materialsTable.type,
  packagingSizeL: materialsTable.packagingSizeL,
  color: materialsTable.color,
  deadStockThreshold: materialsTable.deadStockThreshold,
  currency: materialsTable.currency,
  isActive: materialsTable.isActive,
  createdAt: materialsTable.createdAt,
};

async function getLatestPrice(materialId: number) {
  const [latest] = await db
    .select()
    .from(materialPricesTable)
    .where(eq(materialPricesTable.materialId, materialId))
    .orderBy(desc(materialPricesTable.effectiveDate), desc(materialPricesTable.createdAt))
    .limit(1);
  return latest ?? null;
}

async function serializeMaterial(row: {
  id: number;
  brandId: number;
  brandName: string;
  description: string;
  type: string;
  packagingSizeL: number;
  color: string | null;
  deadStockThreshold: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
}) {
  const latest = await getLatestPrice(row.id);
  return {
    ...row,
    currentUnitPrice: latest?.unitPrice ?? null,
  };
}

router.get("/materials", requireAnyRole, async (_req, res): Promise<void> => {
  const rows = await db
    .select(materialColumns)
    .from(materialsTable)
    .innerJoin(brandsTable, eq(materialsTable.brandId, brandsTable.id))
    .orderBy(asc(materialsTable.description));

  const materials = await Promise.all(rows.map(serializeMaterial));
  res.json(ListMaterialsResponse.parse(materials));
});

router.post("/materials", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMaterialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, parsed.data.brandId));
  if (!brand) {
    res.status(400).json({ error: "Unknown brandId" });
    return;
  }

  const [created] = await db.insert(materialsTable).values(parsed.data).returning();
  await recordAudit({ req, action: "create", entityType: "material", entityId: created.id, changes: { ...parsed.data } });

  const serialized = await serializeMaterial({ ...created, brandName: brand.name });
  res.status(201).json(CreateMaterialResponse.parse(serialized));
});

router.get("/materials/:id", requireAnyRole, async (req, res): Promise<void> => {
  const params = GetMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select(materialColumns)
    .from(materialsTable)
    .innerJoin(brandsTable, eq(materialsTable.brandId, brandsTable.id))
    .where(eq(materialsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Material not found" });
    return;
  }

  res.json(GetMaterialResponse.parse(await serializeMaterial(row)));
});

router.patch("/materials/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMaterialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(materialsTable).where(eq(materialsTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ error: "Material not found" });
    return;
  }

  if (parsed.data.brandId !== undefined) {
    const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, parsed.data.brandId));
    if (!brand) {
      res.status(400).json({ error: "Unknown brandId" });
      return;
    }
  }

  const [updated] = await db
    .update(materialsTable)
    .set(parsed.data)
    .where(eq(materialsTable.id, params.data.id))
    .returning();

  const changes = diffFields(before, parsed.data);
  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "material", entityId: updated.id, changes });
  }

  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, updated.brandId));
  res.json(UpdateMaterialResponse.parse(await serializeMaterial({ ...updated, brandName: brand!.name })));
});

router.delete("/materials/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, params.data.id));
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }

  const [{ value: priceCount }] = await db
    .select({ value: count() })
    .from(materialPricesTable)
    .where(eq(materialPricesTable.materialId, params.data.id));
  const [{ value: stockCount }] = await db
    .select({ value: count() })
    .from(stockMovementsTable)
    .where(eq(stockMovementsTable.materialId, params.data.id));
  const [{ value: jobItemCount }] = await db
    .select({ value: count() })
    .from(jobItemsTable)
    .where(or(
      eq(jobItemsTable.primerBaseMaterialId, params.data.id),
      eq(jobItemsTable.primerHrdMaterialId, params.data.id),
      eq(jobItemsTable.primerThinnerMaterialId, params.data.id),
      eq(jobItemsTable.topcoatBaseMaterialId, params.data.id),
      eq(jobItemsTable.topcoatHrdMaterialId, params.data.id),
      eq(jobItemsTable.topcoatThinnerMaterialId, params.data.id),
    ));

  if (Number(priceCount) > 0 || Number(stockCount) > 0 || Number(jobItemCount) > 0) {
    res.status(409).json({ error: "Material is referenced by prices, stock, or job items. Deactivate it instead." });
    return;
  }

  await db.delete(materialsTable).where(eq(materialsTable.id, params.data.id));
  await recordAudit({ req, action: "delete", entityType: "material", entityId: material.id, changes: { description: material.description } });
  res.sendStatus(204);
});

router.get("/materials/:id/prices", requireAnyRole, async (req, res): Promise<void> => {
  const params = ListMaterialPricesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const prices = await db
    .select()
    .from(materialPricesTable)
    .where(eq(materialPricesTable.materialId, params.data.id))
    .orderBy(desc(materialPricesTable.effectiveDate), desc(materialPricesTable.createdAt));
  res.json(ListMaterialPricesResponse.parse(prices));
});

router.post("/materials/:id/prices", requireAdmin, async (req, res): Promise<void> => {
  const params = CreateMaterialPriceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateMaterialPriceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, params.data.id));
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }

  const [created] = await db
    .insert(materialPricesTable)
    .values({
      materialId: params.data.id,
      unitPrice: parsed.data.unitPrice,
      currency: parsed.data.currency,
      effectiveDate: parsed.data.effectiveDate,
      createdByUserId: req.appUser?.id ?? null,
    })
    .returning();

  await recordAudit({
    req,
    action: "create",
    entityType: "material_price",
    entityId: created.id,
    changes: { materialId: params.data.id, ...parsed.data },
  });

  res.status(201).json(CreateMaterialPriceResponse.parse(created));
});

export default router;
