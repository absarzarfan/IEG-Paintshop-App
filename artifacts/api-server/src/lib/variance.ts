import type { JobItem } from "@workspace/db";

export type UsageActuals = {
  primerBaseActualL: number;
  primerHrdActualL: number;
  primerThinnerActualL: number;
  topcoatBaseActualL: number;
  topcoatHrdActualL: number;
  topcoatThinnerActualL: number;
};

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function variancePct(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return round4(((actual - target) / target) * 100);
}

/**
 * Calculates variance from the per-unit job target. The threshold is applied
 * to each paint system total, not to each individual component.
 */
export function calculateUsageVariance(job: JobItem, actuals: UsageActuals) {
  const primerActualTotalL =
    actuals.primerBaseActualL + actuals.primerHrdActualL + actuals.primerThinnerActualL;
  const topcoatActualTotalL =
    actuals.topcoatBaseActualL + actuals.topcoatHrdActualL + actuals.topcoatThinnerActualL;
  const primerTargetTotalL = job.primerBaseL + job.primerHrdL + job.primerThinnerL;
  const topcoatTargetTotalL = job.topcoatBaseL + job.topcoatHrdL + job.topcoatThinnerL;
  const primerVarianceL = primerActualTotalL - primerTargetTotalL;
  const topcoatVarianceL = topcoatActualTotalL - topcoatTargetTotalL;
  const thresholdPct = job.overconsumptionThresholdPct ?? 10;
  const thresholdMultiplier = 1 + thresholdPct / 100;

  return {
    primerActualTotalL: round4(primerActualTotalL),
    topcoatActualTotalL: round4(topcoatActualTotalL),
    primerTargetTotalL: round4(primerTargetTotalL),
    topcoatTargetTotalL: round4(topcoatTargetTotalL),
    primerVarianceL: round4(primerVarianceL),
    topcoatVarianceL: round4(topcoatVarianceL),
    primerVariancePct: variancePct(primerActualTotalL, primerTargetTotalL),
    topcoatVariancePct: variancePct(topcoatActualTotalL, topcoatTargetTotalL),
    thresholdPct: round4(thresholdPct),
    isOverconsumption:
      primerActualTotalL > primerTargetTotalL * thresholdMultiplier ||
      topcoatActualTotalL > topcoatTargetTotalL * thresholdMultiplier,
  };
}