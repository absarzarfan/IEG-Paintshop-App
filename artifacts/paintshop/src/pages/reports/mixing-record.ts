import type { JobItem, JobWorkflowItem, PaintUsage } from "@workspace/api-client-react";

export interface MixingComponent {
  key: string;
  coat: "primer" | "topcoat";
  name: "base" | "hardener" | "thinner";
  actual: number;
  target: number;
  remaining: number;
  expected: number;
  progressVariance: number;
}

export interface MixingRow {
  jobItemId: number;
  jobNo: string;
  customerName: string;
  description: string;
  serials: string[];
  quantity: number;
  registeredQuantity: number;
  progressPct: number;
  primerDates: string[];
  topcoatDates: string[];
  operators: string[];
  components: MixingComponent[];
  addOns: { name: string; target: number; actual: number; remaining: number }[];
  totalTarget: number;
  totalActual: number;
  totalRemaining: number;
  expectedTotal: number;
  progressVariance: number;
  exceeded: boolean;
  planExceeded: boolean;
  missingJob: boolean;
}

const componentFields = [
  ["primer", "base", "primerBaseL", "primerBaseActualL"],
  ["primer", "hardener", "primerHrdL", "primerHrdActualL"],
  ["primer", "thinner", "primerThinnerL", "primerThinnerActualL"],
  ["topcoat", "base", "topcoatBaseL", "topcoatBaseActualL"],
  ["topcoat", "hardener", "topcoatHrdL", "topcoatHrdActualL"],
  ["topcoat", "thinner", "topcoatThinnerL", "topcoatThinnerActualL"],
] as const;

const round = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();

/** Full-order budgets are counted once, while actuals include every shift. */
export function buildMixingRows(
  jobs: JobItem[],
  usage: PaintUsage[],
  workflow: JobWorkflowItem[],
): MixingRow[] {
  // Deduplicate server records by identity, never by JN/SN: separate shifts are valid.
  const records = [...new Map(usage.map((record) => [record.id, record])).values()];
  const work = [...new Map(workflow.map((item) => [item.serialNumberId, item])).values()];
  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  const ids = new Set([...jobMap.keys(), ...records.map((record) => record.jobItemId), ...work.map((item) => item.jobItemId)]);

  return [...ids].map((jobItemId): MixingRow => {
    const job = jobMap.get(jobItemId);
    const entries = records.filter((record) => record.jobItemId === jobItemId);
    const serialWork = work.filter((item) => item.jobItemId === jobItemId);
    const quantity = Math.max(1, job?.orderQuantity ?? serialWork[0]?.orderQuantity ?? 1);
    const serialIds = new Set([...entries.map((record) => record.serialNumberId), ...serialWork.map((item) => item.serialNumberId)]);
    const progressRatio = Math.min(1, serialWork.reduce((sum, item) => sum + Math.max(0, Math.min(100, item.progressPct)) / 100, 0) / quantity);
    const multiplier = job?.targetBasis === "per_unit" ? quantity : 1;
    const components = componentFields.map(([coat, name, targetField, actualField]): MixingComponent => {
      const target = round((job?.[targetField] ?? 0) * multiplier);
      const actual = round(entries.reduce((sum, entry) => sum + entry[actualField], 0));
      const expected = round(target * progressRatio);
      return { key: `${coat}-${name}`, coat, name, target, actual, remaining: round(target - actual), expected, progressVariance: round(expected - actual) };
    });

    const stages = new Map<string, { name: string; target: number; actual: number }>();
    for (const stage of job?.customPaintStages ?? []) {
      stages.set(stage.id, { name: stage.name, target: round(stage.targetLitersTotal * multiplier), actual: 0 });
    }
    // Old usage snapshots may reference a stage no longer present on the recipe.
    // Count its allowance once per SN, not once per shift.
    const legacyTargets = new Map<string, Map<number, number>>();
    for (const entry of entries) {
      for (const stage of entry.customPaintActuals) {
        const row = stages.get(stage.stageId) ?? { name: stage.name, target: 0, actual: 0 };
        row.actual += stage.actualLiters;
        stages.set(stage.stageId, row);
        if (!job?.customPaintStages.some((configured) => configured.id === stage.stageId)) {
          const targets = legacyTargets.get(stage.stageId) ?? new Map<number, number>();
          targets.set(entry.serialNumberId, Math.max(targets.get(entry.serialNumberId) ?? 0, stage.targetLiters));
          legacyTargets.set(stage.stageId, targets);
        }
      }
    }
    for (const [id, targets] of legacyTargets) {
      stages.get(id)!.target = [...targets.values()].reduce((sum, target) => sum + target, 0);
    }
    const addOns = [...stages.values()].map((stage) => ({
      name: stage.name, target: round(stage.target), actual: round(stage.actual), remaining: round(stage.target - stage.actual),
    }));
    const totalTarget = round([...components, ...addOns].reduce((sum, component) => sum + component.target, 0));
    const totalActual = round([...components, ...addOns].reduce((sum, component) => sum + component.actual, 0));
    const expectedTotal = round(totalTarget * progressRatio);
    const progressVariance = round(expectedTotal - totalActual);
    return {
      jobItemId,
      jobNo: job?.jobNo ?? entries[0]?.jobNo ?? serialWork[0]?.jobNo ?? "—",
      customerName: job?.customerName ?? serialWork[0]?.customerName ?? "—",
      description: job?.description ?? serialWork[0]?.description ?? "—",
      serials: unique([...serialWork.map((item) => item.serialNo), ...entries.map((record) => record.serialNo)]),
      quantity,
      registeredQuantity: serialIds.size,
      progressPct: round(progressRatio * 100),
      primerDates: unique(entries.filter((entry) => entry.primerActualTotalL > 0).map((entry) => String(entry.usageDate).slice(0, 10))),
      topcoatDates: unique(entries.filter((entry) => entry.topcoatActualTotalL > 0).map((entry) => String(entry.usageDate).slice(0, 10))),
      operators: unique(entries.map((entry) => entry.operatorName ?? "")),
      components, addOns, totalTarget, totalActual, expectedTotal, progressVariance,
      totalRemaining: round(totalTarget - totalActual),
      exceeded: progressVariance < 0,
      planExceeded: round(totalTarget - totalActual) < 0,
      missingJob: !job,
    };
  }).sort((a, b) => a.customerName.localeCompare(b.customerName) || a.jobNo.localeCompare(b.jobNo));
}
