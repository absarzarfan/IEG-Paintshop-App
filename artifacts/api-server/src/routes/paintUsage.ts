import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import {
  db,
  jobItemsTable,
  jobWorkEventsTable,
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
import { targetsPerUnit } from "../lib/costs";

const router: IRouter = Router();
const canRecordUsage = requireRole("admin", "painter");

function usageWorkEvent(
  usage: typeof paintUsageTable.$inferSelect,
  actorUserId: number | null,
  serial: typeof serialNumbersTable.$inferSelect,
): typeof jobWorkEventsTable.$inferInsert {
  const primer = usage.primerBaseActualL + usage.primerHrdActualL + usage.primerThinnerActualL;
  const topcoat = usage.topcoatBaseActualL + usage.topcoatHrdActualL + usage.topcoatThinnerActualL;
  const stages = usage.customPaintActuals.map((stage) => `${stage.name}: ${stage.actualLiters.toFixed(3)} L`);
  return {
    serialNumberId: serial.id,
    actorUserId,
    eventType: "paint_usage_recorded",
    shift: Number(usage.shift.match(/[123]/)?.[0] ?? serial.activeShift),
    progressPct: serial.progressPct,
    category: usage.category,
    note: [`Cumulative paint usage — Primer: ${primer.toFixed(3)} L`, `Topcoat: ${topcoat.toFixed(3)} L`, ...stages].join("; "),
  };
}

function usageShiftError(serial: typeof serialNumbersTable.$inferSelect, shift: string, role: string | undefined) {
  if (serial.workStatus === "shipped") return "Verified shipment paint usage is locked.";
  const selectedShift = shift.trim().match(/^(?:shift\s*)?([123])$/i);
  if (!selectedShift) return "Select Shift 1, Shift 2, or Shift 3.";
  if (role === "painter" && (serial.workStatus !== "ongoing"
    || serial.activeShift !== Number(selectedShift[1]) || serial.handoverToShift !== null)) {
    return "Start or resume this job in Ongoing Jobs first. Shifts 2 and 3 require a handover from the previous shift.";
  }
  return null;
}

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

function snapshotCustomPaintActuals(
  jobItem: typeof jobItemsTable.$inferSelect,
  requested: Array<{ stageId: string; actualLiters: number }>,
) {
  const stages = jobItem.customPaintStages ?? [];
  const requestedById = new Map(requested.map((item) => [item.stageId, item.actualLiters]));
  if (
    requestedById.size !== requested.length ||
    requested.some((item) => !stages.some((stage) => stage.id === item.stageId))
  ) {
    return null;
  }
  const targetMultiplier = jobItem.targetBasis === "order_total"
    ? 1 / Math.max(jobItem.orderQuantity, 1)
    : 1;
  return stages.map((stage) => ({
    stageId: stage.id,
    name: stage.name,
    coatType: stage.coatType,
    targetLiters: stage.targetLitersTotal * targetMultiplier,
    actualLiters: requestedById.get(stage.id) ?? 0,
  }));
}

function serializeUsage({ usage, jobItem, serial, actor }: UsageRow) {
  const variance = calculateUsageVariance(targetsPerUnit(jobItem), toActuals(usage));
  const customOverconsumption = usage.customPaintActuals.some((actual) =>
    actual.actualLiters > actual.targetLiters * (1 + variance.thresholdPct / 100)
  );
  return {
    id: usage.id,
    jobItemId: usage.jobItemId,
    jobNo: jobItem.jobNo,
    serialNumberId: usage.serialNumberId,
    serialNo: serial.serialNo,
    usageDate: usage.usageDate,
    shift: usage.shift,
    category: usage.category,
    customPaintActuals: usage.customPaintActuals,
    primerBaseActualL: usage.primerBaseActualL,
    primerHrdActualL: usage.primerHrdActualL,
    primerThinnerActualL: usage.primerThinnerActualL,
    topcoatBaseActualL: usage.topcoatBaseActualL,
    topcoatHrdActualL: usage.topcoatHrdActualL,
    topcoatThinnerActualL: usage.topcoatThinnerActualL,
    ...variance,
    isOverconsumption: variance.isOverconsumption || customOverconsumption,
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
  const shiftError = usageShiftError(serial, parsed.data.shift, req.appUser?.role);
  if (shiftError) {
    res.status(409).json({ error: shiftError });
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

  const customPaintActuals = snapshotCustomPaintActuals(jobItem, parsed.data.customPaintActuals ?? []);
  if (!customPaintActuals) {
    res.status(400).json({ error: "A custom paint stage is not part of this job item" });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [record] = await tx.insert(paintUsageTable).values({
      ...parsed.data,
      customPaintActuals,
      createdByUserId: req.appUser?.id ?? null,
    }).returning();
    await tx.insert(jobWorkEventsTable).values(usageWorkEvent(record, req.appUser?.id ?? null, serial));
    return record;
  });

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
  const [serial] = await db.select().from(serialNumbersTable).where(eq(serialNumbersTable.id, before.serialNumberId));
  if (!serial) {
    res.status(404).json({ error: "Serial number not found" });
    return;
  }
  const shiftError = usageShiftError(serial, parsed.data.shift ?? before.shift, req.appUser?.role);
  if (shiftError) {
    res.status(409).json({ error: shiftError });
    return;
  }

  const { customPaintActuals: requestedActuals, ...updateFields } = parsed.data;
  const updateData: Partial<typeof paintUsageTable.$inferInsert> = { ...updateFields };
  if (requestedActuals !== undefined) {
    const [jobItem] = await db
      .select()
      .from(jobItemsTable)
      .where(eq(jobItemsTable.id, before.jobItemId));
    if (!jobItem) {
      res.status(404).json({ error: "Job item not found" });
      return;
    }
    const snapshot = snapshotCustomPaintActuals(jobItem, requestedActuals);
    if (!snapshot) {
      res.status(400).json({ error: "A custom paint stage is not part of this job item" });
      return;
    }
    updateData.customPaintActuals = snapshot;
  }

  const updated = await db.transaction(async (tx) => {
    const [record] = await tx.update(paintUsageTable).set({ ...updateData, updatedAt: new Date() })
      .where(eq(paintUsageTable.id, params.data.id)).returning();
    if (Object.keys(diffFields(before, updateData)).length > 0) {
      await tx.insert(jobWorkEventsTable).values(usageWorkEvent(record, req.appUser?.id ?? null, serial));
    }
    return record;
  });

  const changes = diffFields(before, updateData);
  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "paint_usage", entityId: updated.id, changes });
  }

  const row = await findUsage(updated.id);
  res.json(UpdatePaintUsageResponse.parse(serializeUsage(row!)));
});

export default router;