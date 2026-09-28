import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import {
  db,
  jobItemsTable,
  paintUsageTable,
  serialNumbersTable,
  usersTable,
} from "@workspace/db";
import {
  CreatePaintUsageBody,
  CreatePaintUsageResponse,
  GetPaintUsageParams,
  GetPaintUsageResponse,
  ListPaintUsageQueryParams,
  ListPaintUsageResponse,
  UpdatePaintUsageBody,
  UpdatePaintUsageParams,
  UpdatePaintUsageResponse,
} from "@workspace/api-zod";
import { requireAnyRole, requireRole } from "../middlewares/auth";
import { recordAudit, diffFields } from "../lib/audit";
import { calculateUsageVariance, type UsageActuals } from "../lib/variance";

const router: IRouter = Router();
const canRecordUsage = requireRole("admin", "painter");

const actualFields = [
  "primerBaseActualL",
  "primerHrdActualL",
  "primerThinnerActualL",
  "topcoatBaseActualL",
  "topcoatHrdActualL",
  "topcoatThinnerActualL",
] as const;

type UsageRow = {
  usage: typeof paintUsageTable.$inferSelect;
  jobItem: typeof jobItemsTable.$inferSelect;
  serial: typeof serialNumbersTable.$inferSelect;
  actor: typeof usersTable.$inferSelect | null;
};

function toActuals(row: typeof paintUsageTable.$inferSelect): UsageActuals {
  return {
    primerBaseActualL: row.primerBaseActualL,
    primerHrdActualL: row.primerHrdActualL,
    primerThinnerActualL: row.primerThinnerActualL,
    topcoatBaseActualL: row.topcoatBaseActualL,
    topcoatHrdActualL: row.topcoatHrdActualL,
    topcoatThinnerActualL: row.topcoatThinnerActualL,
  };
}

function serializeUsage({ usage, jobItem, serial, actor }: UsageRow) {
  return {
    id: usage.id,
    jobItemId: usage.jobItemId,
    jobNo: jobItem.jobNo,
    serialNumberId: usage.serialNumberId,
    serialNo: serial.serialNo,
    usageDate: usage.usageDate,
    shift: usage.shift,
    primerBaseActualL: usage.primerBaseActualL,
    primerHrdActualL: usage.primerHrdActualL,
    primerThinnerActualL: usage.primerThinnerActualL,
    topcoatBaseActualL: usage.topcoatBaseActualL,
    topcoatHrdActualL: usage.topcoatHrdActualL,
    topcoatThinnerActualL: usage.topcoatThinnerActualL,
    ...calculateUsageVariance(jobItem, toActuals(usage)),
    notes: usage.notes,
    createdByUserId: usage.createdByUserId,
    createdByName: actor?.name ?? actor?.email ?? null,
    createdAt: usage.createdAt,
    updatedAt: usage.updatedAt,
  };
}

async function findUsage(id: number): Promise<UsageRow | null> {
  const [row] = await db
    .select({
      usage: paintUsageTable,
      jobItem: jobItemsTable,
      serial: serialNumbersTable,
      actor: usersTable,
    })
    .from(paintUsageTable)
    .innerJoin(jobItemsTable, eq(paintUsageTable.jobItemId, jobItemsTable.id))
    .innerJoin(serialNumbersTable, eq(paintUsageTable.serialNumberId, serialNumbersTable.id))
    .leftJoin(usersTable, eq(paintUsageTable.createdByUserId, usersTable.id))
    .where(eq(paintUsageTable.id, id));
  return row ?? null;
}

router.get("/paint-usage", requireAnyRole, async (req, res): Promise<void> => {
  const parsed = ListPaintUsageQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.jobItemId !== undefined) {
    conditions.push(eq(paintUsageTable.jobItemId, parsed.data.jobItemId));
  }
  if (parsed.data.serialNumberId !== undefined) {
    conditions.push(eq(paintUsageTable.serialNumberId, parsed.data.serialNumberId));
  }
  if (parsed.data.fromDate !== undefined) {
    conditions.push(gte(paintUsageTable.usageDate, parsed.data.fromDate));
  }
  if (parsed.data.toDate !== undefined) {
    conditions.push(lte(paintUsageTable.usageDate, parsed.data.toDate));
  }

  const rows = await db
    .select({
      usage: paintUsageTable,
      jobItem: jobItemsTable,
      serial: serialNumbersTable,
      actor: usersTable,
    })
    .from(paintUsageTable)
    .innerJoin(jobItemsTable, eq(paintUsageTable.jobItemId, jobItemsTable.id))
    .innerJoin(serialNumbersTable, eq(paintUsageTable.serialNumberId, serialNumbersTable.id))
    .leftJoin(usersTable, eq(paintUsageTable.createdByUserId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(paintUsageTable.usageDate), asc(jobItemsTable.jobNo), asc(serialNumbersTable.serialNo));

  res.json(ListPaintUsageResponse.parse(rows.map(serializeUsage)));
});

router.post("/paint-usage", canRecordUsage, async (req, res): Promise<void> => {
  const parsed = CreatePaintUsageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [jobItem] = await db.select().from(jobItemsTable).where(eq(jobItemsTable.id, parsed.data.jobItemId));
  if (!jobItem) {
    res.status(400).json({ error: "Job item not found" });
    return;
  }

  const [serial] = await db
    .select()
    .from(serialNumbersTable)
    .where(eq(serialNumbersTable.id, parsed.data.serialNumberId));
  if (!serial || serial.jobItemId !== parsed.data.jobItemId) {
    res.status(400).json({ error: "Serial number does not belong to the selected job item" });
    return;
  }

  const [existing] = await db
    .select({ id: paintUsageTable.id })
    .from(paintUsageTable)
    .where(eq(paintUsageTable.serialNumberId, parsed.data.serialNumberId));
  if (existing) {
    res.status(409).json({ error: "A paint usage record already exists for this serial number" });
    return;
  }

  const [created] = await db
    .insert(paintUsageTable)
    .values({
      ...parsed.data,
      createdByUserId: req.appUser?.id ?? null,
    })
    .returning();

  await recordAudit({
    req,
    action: "create",
    entityType: "paint_usage",
    entityId: created.id,
    changes: { ...parsed.data },
  });

  const serialized = serializeUsage({
    usage: created,
    jobItem,
    serial,
    actor: req.appUser ?? null,
  });
  res.status(201).json(CreatePaintUsageResponse.parse(serialized));
});

router.get("/paint-usage/:id", requireAnyRole, async (req, res): Promise<void> => {
  const params = GetPaintUsageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const row = await findUsage(params.data.id);
  if (!row) {
    res.status(404).json({ error: "Paint usage record not found" });
    return;
  }

  res.json(GetPaintUsageResponse.parse(serializeUsage(row)));
});

router.patch("/paint-usage/:id", canRecordUsage, async (req, res): Promise<void> => {
  const params = UpdatePaintUsageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePaintUsageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(paintUsageTable).where(eq(paintUsageTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ error: "Paint usage record not found" });
    return;
  }

  const [updated] = await db
    .update(paintUsageTable)
    .set(parsed.data)
    .where(eq(paintUsageTable.id, params.data.id))
    .returning();

  const changes = diffFields(before, parsed.data);
  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "paint_usage", entityId: updated.id, changes });
  }

  const row = await findUsage(updated.id);
  res.json(UpdatePaintUsageResponse.parse(serializeUsage(row!)));
});

export default router;