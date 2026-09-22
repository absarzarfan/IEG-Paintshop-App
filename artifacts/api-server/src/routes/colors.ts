import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, colorsTable } from "@workspace/db";
import {
  ListColorsResponse,
  CreateColorBody,
  CreateColorResponse,
  UpdateColorParams,
  UpdateColorBody,
  UpdateColorResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireAnyRole } from "../middlewares/auth";
import { recordAudit, diffFields } from "../lib/audit";

const router: IRouter = Router();

router.get("/colors", requireAnyRole, async (_req, res): Promise<void> => {
  const rows = await db.select().from(colorsTable).orderBy(colorsTable.name);
  res.json(ListColorsResponse.parse(rows));
});

router.post("/colors", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateColorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db.insert(colorsTable).values(parsed.data).returning();
  await recordAudit({ req, action: "create", entityType: "color", entityId: created.id, changes: { ...parsed.data } });
  res.status(201).json(CreateColorResponse.parse(created));
});

router.patch("/colors/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateColorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateColorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(colorsTable).where(eq(colorsTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ error: "Color not found" });
    return;
  }

  const [updated] = await db.update(colorsTable).set(parsed.data).where(eq(colorsTable.id, params.data.id)).returning();

  const changes = diffFields(before, parsed.data);
  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "color", entityId: updated.id, changes });
  }

  res.json(UpdateColorResponse.parse(updated));
});

router.delete("/colors/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateColorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [color] = await db.select().from(colorsTable).where(eq(colorsTable.id, params.data.id));
  if (!color) {
    res.status(404).json({ error: "Color not found" });
    return;
  }

  await db.delete(colorsTable).where(eq(colorsTable.id, params.data.id));
  await recordAudit({ req, action: "delete", entityType: "color", entityId: color.id, changes: { name: color.name, hexCode: color.hexCode } });
  res.sendStatus(204);
});

export default router;
