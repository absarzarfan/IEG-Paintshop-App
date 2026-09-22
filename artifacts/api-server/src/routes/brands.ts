import { Router, type IRouter } from "express";
import { eq, count } from "drizzle-orm";
import { db, brandsTable, materialsTable } from "@workspace/db";
import {
  ListBrandsResponse,
  CreateBrandBody,
  CreateBrandResponse,
  UpdateBrandParams,
  UpdateBrandBody,
  UpdateBrandResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireAnyRole } from "../middlewares/auth";
import { recordAudit, diffFields } from "../lib/audit";

const router: IRouter = Router();

router.get("/brands", requireAnyRole, async (_req, res): Promise<void> => {
  const rows = await db.select().from(brandsTable).orderBy(brandsTable.name);
  res.json(ListBrandsResponse.parse(rows));
});

router.post("/brands", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateBrandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db.insert(brandsTable).values(parsed.data).returning();
  await recordAudit({ req, action: "create", entityType: "brand", entityId: created.id, changes: { ...parsed.data } });
  res.status(201).json(CreateBrandResponse.parse(created));
});

router.patch("/brands/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateBrandParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBrandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(brandsTable).where(eq(brandsTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }

  const [updated] = await db.update(brandsTable).set(parsed.data).where(eq(brandsTable.id, params.data.id)).returning();

  const changes = diffFields(before, parsed.data);
  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "brand", entityId: updated.id, changes });
  }

  res.json(UpdateBrandResponse.parse(updated));
});

router.delete("/brands/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateBrandParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.id, params.data.id));
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }

  const [{ value: materialCount }] = await db
    .select({ value: count() })
    .from(materialsTable)
    .where(eq(materialsTable.brandId, params.data.id));
  if (Number(materialCount) > 0) {
    res.status(409).json({ error: "Brand is still referenced by materials. Deactivate it instead." });
    return;
  }

  await db.delete(brandsTable).where(eq(brandsTable.id, params.data.id));
  await recordAudit({ req, action: "delete", entityType: "brand", entityId: brand.id, changes: { name: brand.name } });
  res.sendStatus(204);
});

export default router;
