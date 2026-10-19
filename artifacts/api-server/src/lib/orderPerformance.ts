import type { JobItem } from "@workspace/db";

type WorkflowFinancials = {
  jobItemId: number;
  progressPct: number;
  expectedProgressLiters: number;
  actualTotalL: number;
  expectedMaterialCost: number | null;
  actualMaterialCost: number | null;
  materialCostCurrency: string | null;
};

const round = (value: number) => Math.round(value * 10000) / 10000;

export function progressVariance(expected: number, actual: number) {
  return {
    variance: round(expected - actual),
    variancePct: expected > 0 ? round((expected - actual) / expected * 100) : null,
  };
}

function costs(rows: Array<Pick<WorkflowFinancials, "expectedMaterialCost" | "actualMaterialCost" | "materialCostCurrency">>) {
  const currencies = new Set(rows.map((row) => row.materialCostCurrency));
  const available = rows.length > 0 && currencies.size === 1 && !currencies.has(null)
    && rows.every((row) => row.expectedMaterialCost !== null && row.actualMaterialCost !== null);
  const expectedMaterialCost = available ? round(rows.reduce((sum, row) => sum + row.expectedMaterialCost!, 0)) : null;
  const actualMaterialCost = available ? round(rows.reduce((sum, row) => sum + row.actualMaterialCost!, 0)) : null;
  const variance = expectedMaterialCost !== null && actualMaterialCost !== null
    ? progressVariance(expectedMaterialCost, actualMaterialCost)
    : null;
  return {
    materialCostCurrency: available ? rows[0].materialCostCurrency : null,
    expectedMaterialCost,
    actualMaterialCost,
    materialCostVariance: variance?.variance ?? null,
    materialCostVariancePct: variance?.variancePct ?? null,
  };
}

/** Unregistered SNs still contribute to the order plan, but not to completed progress. */
export function aggregateOrderPerformance(jobs: JobItem[], workflow: WorkflowFinancials[]) {
  const orders = jobs.map((job) => {
    const rows = workflow.filter((row) => row.jobItemId === job.id);
    const quantity = Math.max(job.orderQuantity, 1);
    const fixedTargets = job.primerBaseL + job.primerHrdL + job.primerThinnerL
      + job.topcoatBaseL + job.topcoatHrdL + job.topcoatThinnerL;
    const stageTargets = job.customPaintStages.reduce((sum, stage) => sum + stage.targetLitersTotal, 0);
    const targetTotalL = round((fixedTargets + stageTargets) * (job.targetBasis === "order_total" ? 1 : quantity));
    const expectedProgressLiters = round(rows.reduce((sum, row) => sum + row.expectedProgressLiters, 0));
    const actualTotalL = round(rows.reduce((sum, row) => sum + row.actualTotalL, 0));
    const variance = progressVariance(expectedProgressLiters, actualTotalL);
    return {
      jobItemId: job.id,
      jobNo: job.jobNo,
      customerName: job.customerName.trim() || "—",
      quantity,
      progressPct: round(Math.min(100, rows.reduce((sum, row) => sum + row.progressPct, 0) / quantity)),
      targetTotalL,
      expectedProgressLiters,
      actualTotalL,
      remainingLiters: round(targetTotalL - actualTotalL),
      literVariance: variance.variance,
      literVariancePct: variance.variancePct,
      ...costs(rows),
    };
  });
  return [...new Set(orders.map((order) => order.customerName))].map((customerName) => {
    const customerOrders = orders.filter((order) => order.customerName === customerName);
    const quantity = customerOrders.reduce((sum, order) => sum + order.quantity, 0);
    const targetTotalL = round(customerOrders.reduce((sum, order) => sum + order.targetTotalL, 0));
    const expectedProgressLiters = round(customerOrders.reduce((sum, order) => sum + order.expectedProgressLiters, 0));
    const actualTotalL = round(customerOrders.reduce((sum, order) => sum + order.actualTotalL, 0));
    const variance = progressVariance(expectedProgressLiters, actualTotalL);
    return {
      customerName,
      quantity,
      progressPct: round(customerOrders.reduce((sum, order) => sum + order.progressPct * order.quantity, 0) / quantity),
      targetTotalL,
      expectedProgressLiters,
      actualTotalL,
      remainingLiters: round(targetTotalL - actualTotalL),
      literVariance: variance.variance,
      literVariancePct: variance.variancePct,
      ...costs(customerOrders),
      orders: customerOrders,
    };
  });
}
