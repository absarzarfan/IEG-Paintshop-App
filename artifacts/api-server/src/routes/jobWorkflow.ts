import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
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
import { computeJobItemCosts, computePaintUsageCost, targetsPerUnit } from "../lib/costs";
import { recordAudit } from "../lib/audit";

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

async function serializeWorkflow(serialNumberId: number) {
  const [row] = await db
    .select({ serial: serialNumbersTable, job: jobItemsTable, usage: paintUsageTable })
    .from(serialNumbersTable)
    .innerJoin(jobItemsTable, eq(serialNumbersTable.jobItemId, jobItemsTable.id))
    .leftJoin(paintUsageTable, eq(paintUsageTable.serialNumberId, serialNumbersTable.id))
    .where(eq(serialNumbersTable.id, serialNumberId));
  if (!row) return null;

  const perUnitJob = targetsPerUnit(row.job);
  const plannedCost = await computeJobItemCosts(perUnitJob);
  const primerTargetL = perUnitJob.primerBaseL + perUnitJob.primerHrdL + perUnitJob.primerThinnerL;
  const topcoatTargetL = perUnitJob.topcoatBaseL + perUnitJob.topcoatHrdL + perUnitJob.topcoatThinnerL;
  const primerCostPerL = primerTargetL > 0 && plannedCost.primerCostTotal !== null
    ? plannedCost.primerCostTotal / primerTargetL
    : null;
  const topcoatCostPerL = topcoatTargetL > 0 && plannedCost.topcoatCostTotal !== null
    ? plannedCost.topcoatCostTotal / topcoatTargetL
    : null;
  const customPaintStages = (row.job.customPaintStages ?? []).map((stage) => {
    const targetMultiplier = row.job.targetBasis === "order_total"
      ? 1 / Math.max(row.job.orderQuantity, 1)
      : 1;
    const targetLiters = stage.targetLitersTotal * targetMultiplier;
    const actualLiters = row.usage?.customPaintActuals?.find((actual) => actual.stageId === stage.id)?.actualLiters ?? 0;
    const rate = stage.coatType === "primer" ? primerCostPerL : topcoatCostPerL;
    const targetCost = rate === null ? null : rate * targetLiters;
    const expectedCost = targetCost === null ? null : targetCost * row.serial.progressPct / 100;
    const actualCost = rate === null ? null : rate * actualLiters;
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
      costRate: rate,
    };
  });
  const customStageCostsKnown = customPaintStages.every((stage) =>
    stage.costRate !== null || (stage.targetLiters === 0 && stage.actualLiters === 0)
  );
  const customStageTargetCost = customPaintStages.reduce((total, stage) => total + (stage.targetCost ?? 0), 0);
  const customStageActualCost = customPaintStages.reduce((total, stage) => total + (stage.actualCost ?? 0), 0);
  const targetTotalL = totalTargets(perUnitJob) + customPaintStages.reduce((total, stage) => total + stage.targetLiters, 0);
  const actualTotalL = totalActuals(row.usage) + customPaintStages.reduce((total, stage) => total + stage.actualLiters, 0);
  const expectedProgressLiters = targetTotalL * row.serial.progressPct / 100;
  const baseTargetCostPerUnit = plannedCost.primerCostTotal !== null && plannedCost.topcoatCostTotal !== null
    ? plannedCost.primerCostTotal + plannedCost.topcoatCostTotal
    : null;
  const targetCostPerUnit = baseTargetCostPerUnit !== null && customStageCostsKnown
    ? baseTargetCostPerUnit + customStageTargetCost
    : null;
  const actualCost = row.usage
    ? await computePaintUsageCost(perUnitJob, {
        primerBaseL: row.usage.primerBaseActualL,
        primerHrdL: row.usage.primerHrdActualL,
        primerThinnerL: row.usage.primerThinnerActualL,
        topcoatBaseL: row.usage.topcoatBaseActualL,
        topcoatHrdL: row.usage.topcoatHrdActualL,
        topcoatThinnerL: row.usage.topcoatThinnerActualL,
      })
    : { currency: plannedCost.currency, total: 0 };
  const currency = targetCostPerUnit !== null && actualCost.currency === plannedCost.currency
    ? plannedCost.currency
    : null;
  const expectedMaterialCost = currency ? targetCostPerUnit! * row.serial.progressPct / 100 : null;
  const actualMaterialCost = currency && actualCost.total !== null && customStageCostsKnown
    ? actualCost.total + customStageActualCost
    : null;
  const materialCostVariance = expectedMaterialCost !== null && actualMaterialCost !== null
    ? Math.round((expectedMaterialCost - actualMaterialCost) * 100) / 100
    : null;
  const materialCostVariancePct = expectedMaterialCost && materialCostVariance !== null
    ? Math.round((materialCostVariance / expectedMaterialCost) * 10000) / 100
    : null;

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
    customPaintStages: customPaintStages.map(({ costRate: _costRate, ...stage }) => stage),
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
          if (handoverToShift === undefined || handoverToShift <= selectedShift) {
            res.status(400).json({ error: "Handover must be to a later shift (2 or 3)" });
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
          const [usage] = await db.select({ id: paintUsageTable.id }).from(paintUsageTable)
            .where(eq(paintUsageTable.serialNumberId, serial.id));
          if (!usage) {
            res.status(409).json({ error: "Record Paint Usage before completing this job." });
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
