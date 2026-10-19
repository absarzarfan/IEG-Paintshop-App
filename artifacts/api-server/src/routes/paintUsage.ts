import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  jobItemsTable,
  jobWorkEventsTable,
  materialsTable,
  paintUsageTable,
  serialNumbersTable,
  stockMovementsTable,
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
    note: [`Primer: ${primer.toFixed(3)} L`, `Topcoat: ${topcoat.toFixed(3)} L`, ...stages].join("; "),
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

function canonicalShift(shift: string) {
  const match = shift.trim().match(/^(?:shift\s*)?([123])$/i);
  return match ? `Shift ${match[1]}` : shift.trim();
}

function isUsageShiftConflict(error: unknown) {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "23505" &&
    "constraint" in error && error.constraint === "paint_usage_serial_shift_unique";
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
    materialId: stage.materialId ?? null,
  }));
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class StockAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockAllocationError";
  }
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function usageStockLines(
  usage: typeof paintUsageTable.$inferSelect,
  jobItem: typeof jobItemsTable.$inferSelect,
) {
  const fixedComponents = [
    { key: "primerBase", actual: "primerBaseActualL", material: "primerBaseMaterialId" },
    { key: "primerHardener", actual: "primerHrdActualL", material: "primerHrdMaterialId" },
    { key: "primerThinner", actual: "primerThinnerActualL", material: "primerThinnerMaterialId" },
    { key: "topcoatBase", actual: "topcoatBaseActualL", material: "topcoatBaseMaterialId" },
    { key: "topcoatHardener", actual: "topcoatHrdActualL", material: "topcoatHrdMaterialId" },
    { key: "topcoatThinner", actual: "topcoatThinnerActualL", material: "topcoatThinnerMaterialId" },
  ] as const;
  const lines: Array<{ component: string; label: string; materialId: number; quantityL: number }> = [];

  for (const component of fixedComponents) {
    const quantityL = round4(usage[component.actual]);
    if (quantityL <= 0) continue;
    const materialId = jobItem[component.material];
    if (materialId == null) {
      throw new StockAllocationError(`No material is assigned to ${component.key} on Job ${jobItem.jobNo}; assign it before recording paint usage.`);
    }
    lines.push({ component: component.key, label: component.key, materialId, quantityL });
  }

  for (const actual of usage.customPaintActuals ?? []) {
    const quantityL = round4(actual.actualLiters);
    if (quantityL <= 0) continue;
    if (actual.materialId == null) {
      throw new StockAllocationError(`No material is assigned to additional paint stage "${actual.name}" on Job ${jobItem.jobNo}.`);
    }
    lines.push({
      component: `custom:${actual.stageId}`,
      label: actual.name,
      materialId: actual.materialId,
      quantityL,
    });
  }
  return lines;
}

type StockLotBalance = {
  materialId: number;
  lotNo: string | null;
  expiryDate: Date | null;
  expiryKey: string | null;
  firstReceivedAt: number;
  balanceL: number;
};

function expiryKeyForDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function restoreUsageStock(tx: DbTransaction, usageId: number, actorUserId: number | null) {
  const rows = await tx.select().from(stockMovementsTable)
    .where(eq(stockMovementsTable.sourcePaintUsageId, usageId));
  const outstanding = new Map<string, StockLotBalance & { component: string; netL: number }>();
  for (const row of rows) {
    if (!row.usageComponent || (row.movementType !== "out" && row.movementType !== "return_to_stock")) continue;
    const expiryKey = expiryKeyForDate(row.expiryDate);
    const key = JSON.stringify([row.usageComponent, row.materialId, row.lotNo, expiryKey]);
    const current = outstanding.get(key) ?? {
      component: row.usageComponent,
      materialId: row.materialId,
      lotNo: row.lotNo,
      expiryDate: row.expiryDate,
      expiryKey,
      firstReceivedAt: row.createdAt.getTime(),
      balanceL: 0,
      netL: 0,
    };
    current.netL += row.movementType === "out" ? row.quantityL : -row.quantityL;
    outstanding.set(key, current);
  }

  for (const line of outstanding.values()) {
    const quantityL = round4(line.netL);
    if (quantityL <= 0) continue;
    await tx.insert(stockMovementsTable).values({
      materialId: line.materialId,
      movementType: "return_to_stock",
      quantityL,
      lotNo: line.lotNo,
      expiryDate: line.expiryDate,
      notes: `Automatic stock reversal for edited Paint Usage #${usageId}`,
      sourcePaintUsageId: usageId,
      usageComponent: line.component,
      createdByUserId: actorUserId,
    });
  }
}

async function issueUsageStock(
  tx: DbTransaction,
  usage: typeof paintUsageTable.$inferSelect,
  jobItem: typeof jobItemsTable.$inferSelect,
  actorUserId: number | null,
) {
  const lines = usageStockLines(usage, jobItem);
  if (lines.length === 0) return;

  const materialIds = [...new Set(lines.map((line) => line.materialId))].sort((a, b) => a - b);
  for (const materialId of materialIds) {
    await tx.execute(sql`select pg_advisory_xact_lock(914, ${materialId})`);
  }
  const materials = await tx.select({
    id: materialsTable.id,
    description: materialsTable.description,
    isActive: materialsTable.isActive,
  }).from(materialsTable).where(inArray(materialsTable.id, materialIds));
  const materialById = new Map(materials.map((material) => [material.id, material]));
  for (const id of materialIds) {
    const material = materialById.get(id);
    if (!material || !material.isActive) {
      throw new StockAllocationError(`Material #${id} is inactive or unavailable; update the Job material mapping before recording paint usage.`);
    }
  }

  const movements = await tx.select({
    materialId: stockMovementsTable.materialId,
    movementType: stockMovementsTable.movementType,
    quantityL: stockMovementsTable.quantityL,
    lotNo: stockMovementsTable.lotNo,
    expiryDate: stockMovementsTable.expiryDate,
    createdAt: stockMovementsTable.createdAt,
  }).from(stockMovementsTable)
    .where(inArray(stockMovementsTable.materialId, materialIds))
    .orderBy(asc(stockMovementsTable.createdAt), asc(stockMovementsTable.id));

  const lots = new Map<string, StockLotBalance>();
  for (const movement of movements) {
    const expiryKey = expiryKeyForDate(movement.expiryDate);
    const key = JSON.stringify([movement.materialId, movement.lotNo, expiryKey]);
    const lot = lots.get(key) ?? {
      materialId: movement.materialId,
      lotNo: movement.lotNo,
      expiryDate: movement.expiryDate,
      expiryKey,
      firstReceivedAt: movement.createdAt.getTime(),
      balanceL: 0,
    };
    lot.balanceL += movement.movementType === "out" ? -movement.quantityL : movement.quantityL;
    if (movement.movementType !== "out") {
      lot.firstReceivedAt = Math.min(lot.firstReceivedAt, movement.createdAt.getTime());
    }
    lots.set(key, lot);
  }

  const byMaterial = new Map<number, StockLotBalance[]>();
  for (const lot of lots.values()) {
    byMaterial.set(lot.materialId, [...(byMaterial.get(lot.materialId) ?? []), lot]);
  }
  const today = new Date().toISOString().slice(0, 10);
  const plans = new Map<number, Array<{ line: typeof lines[number]; lot: StockLotBalance; quantityL: number }>>();
  for (const materialId of materialIds) {
    const materialLines = lines.filter((line) => line.materialId === materialId);
    const requiredL = round4(materialLines.reduce((total, line) => total + line.quantityL, 0));
    const eligibleLots = (byMaterial.get(materialId) ?? [])
      .filter((lot) => lot.balanceL > 0 && (!lot.expiryKey || lot.expiryKey >= today))
      .sort((a, b) => {
        if (a.expiryKey && b.expiryKey && a.expiryKey !== b.expiryKey) return a.expiryKey.localeCompare(b.expiryKey);
        if (a.expiryKey && !b.expiryKey) return -1;
        if (!a.expiryKey && b.expiryKey) return 1;
        return a.firstReceivedAt - b.firstReceivedAt;
      });
    const availableL = round4(eligibleLots.reduce((total, lot) => total + lot.balanceL, 0));
    if (availableL + 0.00005 < requiredL) {
      const material = materialById.get(materialId)!;
      throw new StockAllocationError(
        `Insufficient usable stock for ${material.description}: required ${requiredL.toFixed(4)} L, available ${availableL.toFixed(4)} L. Receive stock or correct the Job material mapping.`,
      );
    }

    const allocations: Array<{ line: typeof lines[number]; lot: StockLotBalance; quantityL: number }> = [];
    let lotIndex = 0;
    let lotRemainingL = eligibleLots[0]?.balanceL ?? 0;
    for (const line of materialLines) {
      let remainingL = line.quantityL;
      while (remainingL > 0.00005) {
        const lot = eligibleLots[lotIndex];
        if (!lot) throw new StockAllocationError(`Unable to allocate FIFO stock for ${materialById.get(materialId)!.description}.`);
        if (lotRemainingL <= 0.00005) {
          lotIndex += 1;
          lotRemainingL = eligibleLots[lotIndex]?.balanceL ?? 0;
          continue;
        }
        const quantityL = round4(Math.min(remainingL, lotRemainingL));
        allocations.push({ line, lot, quantityL });
        remainingL = round4(remainingL - quantityL);
        lotRemainingL = round4(lotRemainingL - quantityL);
      }
    }
    plans.set(materialId, allocations);
  }

  for (const allocations of plans.values()) {
    for (const allocation of allocations) {
      await tx.insert(stockMovementsTable).values({
        materialId: allocation.line.materialId,
        movementType: "out",
        quantityL: allocation.quantityL,
        lotNo: allocation.lot.lotNo,
        expiryDate: allocation.lot.expiryDate,
        notes: `Automatic FIFO issue for Paint Usage #${usage.id} (${allocation.line.label})`,
        sourcePaintUsageId: usage.id,
        usageComponent: allocation.line.component,
        createdByUserId: actorUserId,
      });
    }
  }
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
  const shift = canonicalShift(parsed.data.shift);

  const [existing] = await db
    .select({ id: paintUsageTable.id })
    .from(paintUsageTable)
    .where(and(
      eq(paintUsageTable.serialNumberId, parsed.data.serialNumberId),
      eq(paintUsageTable.shift, shift),
    ));
  if (existing) {
    res.status(409).json({ error: `A paint usage record already exists for ${shift} on this serial number` });
    return;
  }

  const customPaintActuals = snapshotCustomPaintActuals(jobItem, parsed.data.customPaintActuals ?? []);
  if (!customPaintActuals) {
    res.status(400).json({ error: "A custom paint stage is not part of this job item" });
    return;
  }

  let created: typeof paintUsageTable.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      const [record] = await tx.insert(paintUsageTable).values({
        ...parsed.data,
        shift,
        customPaintActuals,
        createdByUserId: req.appUser?.id ?? null,
      }).returning();
      await issueUsageStock(tx, record, jobItem, req.appUser?.id ?? null);
      await tx.insert(jobWorkEventsTable).values(usageWorkEvent(record, req.appUser?.id ?? null, serial));
      return record;
    });
  } catch (error) {
    if (isUsageShiftConflict(error)) {
      res.status(409).json({ error: `A paint usage record already exists for ${shift} on this serial number` });
      return;
    }
    if (error instanceof StockAllocationError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }

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
  const [jobItem] = await db.select().from(jobItemsTable).where(eq(jobItemsTable.id, before.jobItemId));
  if (!jobItem) {
    res.status(404).json({ error: "Job item not found" });
    return;
  }
  const shiftError = usageShiftError(serial, parsed.data.shift ?? before.shift, req.appUser?.role);
  if (shiftError) {
    res.status(409).json({ error: shiftError });
    return;
  }

  const { customPaintActuals: requestedActuals, ...updateFields } = parsed.data;
  if (updateFields.shift !== undefined) updateFields.shift = canonicalShift(updateFields.shift);
  const nextShift = updateFields.shift ?? before.shift;
  const [shiftConflict] = await db.select({ id: paintUsageTable.id }).from(paintUsageTable)
    .where(and(
      eq(paintUsageTable.serialNumberId, before.serialNumberId),
      eq(paintUsageTable.shift, nextShift),
    ));
  if (shiftConflict && shiftConflict.id !== before.id) {
    res.status(409).json({ error: `A paint usage record already exists for ${nextShift} on this serial number` });
    return;
  }
  const updateData: Partial<typeof paintUsageTable.$inferInsert> = { ...updateFields };
  if (requestedActuals !== undefined) {
    const snapshot = snapshotCustomPaintActuals(jobItem, requestedActuals);
    if (!snapshot) {
      res.status(400).json({ error: "A custom paint stage is not part of this job item" });
      return;
    }
    updateData.customPaintActuals = snapshot;
  }

  const changes = diffFields(before, updateData);
  const stockRelevantChange = actualFields.some((field) =>
    field in updateData && updateData[field] !== before[field]
  ) || (updateData.customPaintActuals !== undefined
    && JSON.stringify(updateData.customPaintActuals) !== JSON.stringify(before.customPaintActuals));
  let updated: typeof paintUsageTable.$inferSelect;
  try {
    updated = await db.transaction(async (tx) => {
      const [record] = await tx.update(paintUsageTable).set({ ...updateData, updatedAt: new Date() })
        .where(eq(paintUsageTable.id, params.data.id)).returning();
      if (stockRelevantChange) {
        await restoreUsageStock(tx, before.id, req.appUser?.id ?? null);
        await issueUsageStock(tx, record, jobItem, req.appUser?.id ?? null);
      }
      if (Object.keys(changes).length > 0) {
        await tx.insert(jobWorkEventsTable).values(usageWorkEvent(record, req.appUser?.id ?? null, serial));
      }
      return record;
    });
  } catch (error) {
    if (isUsageShiftConflict(error)) {
      res.status(409).json({ error: `A paint usage record already exists for ${nextShift} on this serial number` });
      return;
    }
    if (error instanceof StockAllocationError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }

  if (Object.keys(changes).length > 0) {
    await recordAudit({ req, action: "update", entityType: "paint_usage", entityId: updated.id, changes });
  }

  const row = await findUsage(updated.id);
  res.json(UpdatePaintUsageResponse.parse(serializeUsage(row!)));
});

export default router;