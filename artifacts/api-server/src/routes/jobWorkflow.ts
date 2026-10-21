import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  jobItemsTable,
  jobWorkEventsTable,
  paintUsageTable,
  serialNumbersTable,
  usersTable,
  type JobItem,
} from "@workspace/db";
import {
  ListJobWorkflowHistoryParams,
  UpdateJobWorkflowBody,
  UpdateJobWorkflowParams,
  UpdateJobWorkflowResponse,
  ListJobWorkflowQueryParams,
  ListJobWorkflowResponse,
  ListJobWorkflowHistoryResponse,
} from "@workspace/api-zod";
import { requireAnyRole, requireRole } from "../middlewares/auth";
import { computeJobItemCosts, computePaintUsageCost, getCurrentMaterialPrice, targetsPerUnit } from "../lib/costs";
import { recordAudit } from "../lib/audit";
import { progressVariance } from "../lib/orderPerformance";

const router: IRouter = Router();

type UsageActuals = Pick<
  typeof paintUsageTable.$inferSelect,
  | "primerBaseActualL"
  | "primerHrdActualL"
  | "primerThinnerActualL"
  | "topcoatBaseActualL"
  | "topcoatHrdActualL"
  | "topcoatThinnerActualL"
>;

function totalTargets(job: JobItem) {
  return job.primerBaseL + job.primerHrdL + job.primerThinnerL +
    job.topcoatBaseL + job.topcoatHrdL + job.topcoatThinnerL;
}

function totalActuals(actuals: UsageActuals | null) {
  if (!actuals) return 0;
  return actuals.primerBaseActualL + actuals.primerHrdActualL + actuals.primerThinnerActualL +
    actuals.topcoatBaseActualL + actuals.topcoatHrdActualL + actuals.topcoatThinnerActualL;
}

async function hasPaintUsageForShift(serialNumberId: number, shift: number) {
  const [usage] = await db.select({ id: paintUsageTable.id })
    .from(paintUsageTable)
    .where(and(
      eq(paintUsageTable.serialNumberId, serialNumberId),
      eq(paintUsageTable.shift, `Shift ${shift}`),
    ))
    .limit(1);
  return Boolean(usage);
}

export async function serializeWorkflow(serialNumberId: number) {
  const [row] = await db
    .select({ serial: serialNumbersTable, job: jobItemsTable })
    .from(serialNumbersTable)
    .innerJoin(jobItemsTable, eq(serialNumbersTable.jobItemId, jobItemsTable.id))
    .where(eq(serialNumbersTable.id, serialNumberId));
  if (!row) return null;

  const usageRows = await db.select().from(paintUsageTable)
    .where(eq(paintUsageTable.serialNumberId, serialNumberId))
    .orderBy(asc(paintUsageTable.createdAt), asc(paintUsageTable.id));
  const actuals: UsageActuals = usageRows.reduce((sum, usage) => ({
    primerBaseActualL: sum.primerBaseActualL + usage.primerBaseActualL,
    primerHrdActualL: sum.primerHrdActualL + usage.primerHrdActualL,
    primerThinnerActualL: sum.primerThinnerActualL + usage.primerThinnerActualL,
    topcoatBaseActualL: sum.topcoatBaseActualL + usage.topcoatBaseActualL,
    topcoatHrdActualL: sum.topcoatHrdActualL + usage.topcoatHrdActualL,
    topcoatThinnerActualL: sum.topcoatThinnerActualL + usage.topcoatThinnerActualL,
  }), {
    primerBaseActualL: 0,
    primerHrdActualL: 0,
    primerThinnerActualL: 0,
    topcoatBaseActualL: 0,
    topcoatHrdActualL: 0,
    topcoatThinnerActualL: 0,
  });
  const customActualsByStage = new Map<string, typeof usageRows[number]["customPaintActuals"]>();
  for (const usage of usageRows) {
    for (const actual of usage.customPaintActuals ?? []) {
      customActualsByStage.set(actual.stageId, [
        ...(customActualsByStage.get(actual.stageId) ?? []),
        actual,
      ]);
    }
  }

  const perUnitJob = targetsPerUnit(row.job);
  const plannedCost = await computeJobItemCosts(perUnitJob);
  const primerTargetL = perUnitJob.primerBaseL + perUnitJob.primerHrdL + perUnitJob.primerThinnerL;
  const topcoatTargetL = perUnitJob.topcoatBaseL + perUnitJob.topcoatHrdL + perUnitJob.topcoatThinnerL;
  const customPaintStages = await Promise.all((row.job.customPaintStages ?? []).map(async (stage) => {
    const targetMultiplier = row.job.targetBasis === "order_total"
      ? 1 / Math.max(row.job.orderQuantity, 1)
      : 1;
    const targetLiters = stage.targetLitersTotal * targetMultiplier;
    const actualSnapshots = customActualsByStage.get(stage.id) ?? [];
    const actualLiters = actualSnapshots.reduce((total, actual) => total + actual.actualLiters, 0);
    const targetPrice = await getCurrentMaterialPrice(stage.materialId ?? null);
    const actualPrices = await Promise.all(actualSnapshots
      .filter((actual) => actual.actualLiters > 0)
      .map((actual) => getCurrentMaterialPrice(actual.materialId ?? stage.materialId ?? null)));
    const targetCostKnown = targetLiters === 0
      || (targetPrice !== null && targetPrice.currency === plannedCost.currency);
    const actualCostKnown = actualLiters === 0 || (
      plannedCost.currency !== null &&
      actualPrices.length > 0 &&
      actualPrices.every((price) => price !== null && price.currency === plannedCost.currency)
    );
    const targetCost = targetLiters === 0
      ? 0
      : targetCostKnown && targetPrice ? targetPrice.unitPrice * targetLiters : null;
    const expectedCost = targetCost === null ? null : targetCost * row.serial.progressPct / 100;
    const actualCost = actualLiters === 0
      ? 0
      : actualCostKnown
        ? actualSnapshots.filter((actual) => actual.actualLiters > 0).reduce((total, actual, index) =>
          total + actual.actualLiters * actualPrices[index]!.unitPrice, 0)
        : null;
    return {
      id: stage.id,
      name: stage.name,
      coatType: stage.coatType,
      targetLiters,
      expectedLiters: targetLiters * row.serial.progressPct / 100,
      actualLiters,
      litersVariance: targetLiters * row.serial.progressPct / 100 - actualLiters,
      targetCost,
      expectedCost,
      actualCost,
      costVariance: expectedCost === null || actualCost === null ? null : expectedCost - actualCost,
      costRate: targetPrice?.currency === plannedCost.currency ? targetPrice.unitPrice : null,
      costKnown: targetCostKnown && actualCostKnown,
    };
  }));
  const customStageCostsKnown = customPaintStages.every((stage) =>
    stage.costKnown
  );
  const customStageTargetCost = customPaintStages.reduce((total, stage) => total + (stage.targetCost ?? 0), 0);
  const customStageActualCost = customPaintStages.reduce((total, stage) => total + (stage.actualCost ?? 0), 0);
  const targetTotalL = totalTargets(perUnitJob) + customPaintStages.reduce((total, stage) => total + stage.targetLiters, 0);
  const actualTotalL = totalActuals(actuals) + customPaintStages.reduce((total, stage) => total + stage.actualLiters, 0);
  const expectedProgressLiters = targetTotalL * row.serial.progressPct / 100;
  const baseTargetCostPerUnit = plannedCost.primerCostTotal !== null && plannedCost.topcoatCostTotal !== null
    ? plannedCost.primerCostTotal + plannedCost.topcoatCostTotal
    : null;
  const targetCostPerUnit = baseTargetCostPerUnit !== null && customStageCostsKnown
    ? baseTargetCostPerUnit + customStageTargetCost
    : null;
  const actualCost = usageRows.length > 0
    ? await computePaintUsageCost(perUnitJob, {
        primerBaseL: actuals.primerBaseActualL,
        primerHrdL: actuals.primerHrdActualL,
        primerThinnerL: actuals.primerThinnerActualL,
        topcoatBaseL: actuals.topcoatBaseActualL,
        topcoatHrdL: actuals.topcoatHrdActualL,
        topcoatThinnerL: actuals.topcoatThinnerActualL,
      })
    : { currency: plannedCost.currency, total: 0 };
  const currency = targetCostPerUnit !== null && actualCost.currency === plannedCost.currency
    ? plannedCost.currency
    : null;
  const expectedMaterialCost = currency ? targetCostPerUnit! * row.serial.progressPct / 100 : null;
  const actualMaterialCost = currency && actualCost.total !== null && customStageCostsKnown
    ? actualCost.total + customStageActualCost
    : null;
  const costVariance = expectedMaterialCost !== null && actualMaterialCost !== null
    ? progressVariance(expectedMaterialCost, actualMaterialCost)
    : null;
  const materialCostVariance = costVariance ? Math.round(costVariance.variance * 100) / 100 : null;
  const materialCostVariancePct = costVariance?.variancePct ?? null;

  return {
    serialNumberId: row.serial.id,
    jobItemId: row.job.id,
    jobNo: row.job.jobNo,
    customerName: row.job.customerName,
    description: row.job.description,
    serialNo: row.serial.serialNo,
    orderQuantity: row.job.orderQuantity,
    workStatus: row.serial.workStatus,
    progressPct: row.serial.progressPct,
    currentCategory: row.serial.currentCategory,
    activeShift: row.serial.activeShift,
    handoverToShift: row.serial.handoverToShift,
    customPaintStages: customPaintStages.map(({ costRate: _costRate, costKnown: _costKnown, ...stage }) => stage),
    targetTotalL: Math.round(targetTotalL * 10000) / 10000,
    actualTotalL: Math.round(actualTotalL * 10000) / 10000,
    expectedProgressLiters: Math.round(expectedProgressLiters * 10000) / 10000,
    literVariance: Math.round((expectedProgressLiters - actualTotalL) * 10000) / 10000,
    materialCostCurrency: currency,
    expectedMaterialCost,
    actualMaterialCost,
    materialCostVariance,
    materialCostVariancePct,
    createdAt: row.serial.createdAt,
  };
}

router.get("/job-workflow", requireAnyRole, async (req, res): Promise<void> => {
  const parsed = ListJobWorkflowQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const serials = parsed.data.status
    ? await db.select({ id: serialNumbersTable.id }).from(serialNumbersTable)
      .where(eq(serialNumbersTable.workStatus, parsed.data.status))
      .orderBy(asc(serialNumbersTable.createdAt))
    : await db.select({ id: serialNumbersTable.id }).from(serialNumbersTable)
      .orderBy(asc(serialNumbersTable.createdAt));
  const rows = await Promise.all(serials.map((serial) => serializeWorkflow(serial.id)));
  res.json(ListJobWorkflowResponse.parse(rows.filter((row): row is NonNullable<typeof row> => row !== null)));
});

router.get("/serial-numbers/:id/workflow/history", requireAnyRole, async (req, res): Promise<void> => {
  const parsed = ListJobWorkflowHistoryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const events = await db
    .select({ event: jobWorkEventsTable, actor: usersTable })
    .from(jobWorkEventsTable)
    .leftJoin(usersTable, eq(jobWorkEventsTable.actorUserId, usersTable.id))
    .where(eq(jobWorkEventsTable.serialNumberId, parsed.data.id))
    .orderBy(asc(jobWorkEventsTable.createdAt), asc(jobWorkEventsTable.id));
  res.json(ListJobWorkflowHistoryResponse.parse(events.map(({ event, actor }) => ({
    ...event,
    actorName: actor?.name ?? actor?.username ?? null,
  }))));
});

router.post(
  "/serial-numbers/:id/workflow",
  requireRole("admin", "painter"),
  async (req, res): Promise<void> => {
    const params = UpdateJobWorkflowParams.safeParse(req.params);
    const parsed = UpdateJobWorkflowBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [serial] = await db.select().from(serialNumbersTable).where(eq(serialNumbersTable.id, params.data.id));
    if (!serial) {
      res.status(404).json({ error: "Serial Number not found" });
      return;
    }

    const { action, shift, progressPct, category, handoverToShift, note } = parsed.data;
    let eventType: "started" | "progress_updated" | "handed_over" | "completed" | "shipment_verified";
    let next = { ...serial };

    if (action === "verify_shipment") {
      if (req.appUser?.role !== "painter" || !req.appUser.isPaintLeader) {
        res.status(403).json({ error: "Only a Paint Mixer designated as leader can verify shipment" });
        return;
      }
      if (serial.workStatus !== "shipment") {
        res.status(409).json({ error: "Only completed jobs awaiting shipment can be verified" });
        return;
      }
      next.workStatus = "shipped";
      eventType = "shipment_verified";
    } else {
      if (req.appUser?.role !== "painter" && req.appUser?.role !== "admin") {
        res.status(403).json({ error: "Paint Mixer access is required for work actions" });
        return;
      }
      const selectedShift = shift ?? serial.activeShift;
      if (action === "start") {
        if (serial.workStatus === "queued" && selectedShift === 1) {
          next.workStatus = "ongoing";
          next.activeShift = 1;
          next.currentCategory = category ?? serial.currentCategory;
          next.handoverToShift = null;
          eventType = "started";
        } else if (
          serial.workStatus === "ongoing" &&
          serial.handoverToShift === selectedShift &&
          serial.activeShift + 1 === selectedShift &&
          selectedShift > 1
        ) {
          next.activeShift = selectedShift;
          next.currentCategory = category ?? serial.currentCategory;
          next.handoverToShift = null;
          eventType = "started";
        } else {
          res.status(409).json({ error: "This shift can only start a queued job on Shift 1 or continue a job handed over to it." });
          return;
        }
      } else {
        if (serial.workStatus !== "ongoing") {
          res.status(409).json({ error: "Only an ongoing job can be updated, handed over, or completed." });
          return;
        }
        if (selectedShift !== serial.activeShift || serial.handoverToShift !== null) {
          res.status(409).json({ error: "This job is not currently assigned to the selected shift." });
          return;
        }
        if (action === "update_progress") {
          if (progressPct === undefined) {
            res.status(400).json({ error: "progressPct is required for a progress update" });
            return;
          }
          next.progressPct = progressPct;
          next.currentCategory = category ?? serial.currentCategory;
          eventType = "progress_updated";
        } else if (action === "handover") {
          if (selectedShift >= 3 || handoverToShift !== selectedShift + 1) {
            res.status(400).json({ error: "Handover must be to the next shift only." });
            return;
          }
          if (!await hasPaintUsageForShift(serial.id, selectedShift)) {
            res.status(409).json({ error: "Record Paint Usage for the active shift before handing over this job." });
            return;
          }
          next.progressPct = progressPct ?? serial.progressPct;
          next.currentCategory = category ?? serial.currentCategory;
          next.handoverToShift = handoverToShift;
          eventType = "handed_over";
        } else {
          if (progressPct !== 100) {
            res.status(400).json({ error: "Set progress to 100% before completing this job." });
            return;
          }
          if (!await hasPaintUsageForShift(serial.id, serial.activeShift)) {
            res.status(409).json({ error: "Record Paint Usage for the active shift before completing this job." });
            return;
          }
          next.workStatus = "shipment";
          next.progressPct = 100;
          eventType = "completed";
        }
      }
    }

    await db.update(serialNumbersTable).set({
      workStatus: next.workStatus,
      progressPct: next.progressPct,
      currentCategory: next.currentCategory,
      activeShift: next.activeShift,
      handoverToShift: next.handoverToShift,
    }).where(eq(serialNumbersTable.id, serial.id));

    const [event] = await db.insert(jobWorkEventsTable).values({
      serialNumberId: serial.id,
      actorUserId: req.appUser?.id ?? null,
      eventType,
      shift: shift ?? serial.activeShift,
      progressPct: next.progressPct,
      category: category ?? serial.currentCategory,
      note: note ?? null,
    }).returning();
    await recordAudit({
      req,
      action: "update",
      entityType: "job_workflow",
      entityId: serial.id,
      changes: { action, shift: shift ?? serial.activeShift, progressPct: next.progressPct, category, note },
    });

    const result = await serializeWorkflow(serial.id);
    res.json(UpdateJobWorkflowResponse.parse(result));
  },
);

export default router;
