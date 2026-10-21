export interface PicUsageRecord {
  id: number;
  jobItemId: number;
  serialNumberId: number;
  shift: string;
  updatedAt: Date | string;
  operatorUserId: number | null;
  operatorName: string | null;
  primerTargetTotalL: number;
  topcoatTargetTotalL: number;
  customPaintActuals: { targetLiters: number; actualLiters: number }[];
  primerActualTotalL: number;
  topcoatActualTotalL: number;
  thresholdPct: number;
}

export interface PicWorkflowItem {
  targetTotalL: number;
}

export interface PicWorkEvent {
  id: number;
  eventType: string;
  shift: number | null;
  progressPct: number | null;
  createdAt: Date | string;
}

export interface PicPerformanceRow {
  key: string;
  operatorName: string;
  recordCount: number;
  serialCount: number;
  jobCount: number;
  allActualL: number;
  expectedL: number;
  scoredActualL: number;
  varianceL: number | null;
  variancePct: number | null;
  overconsumptionCount: number;
  scoredShiftCount: number;
  estimatedShiftCount: number;
  unscoredShiftCount: number;
}

type ProgressAllocation = {
  deltaPct: number | null;
  estimated: boolean;
};

const SHIFT_NUMBER = /([123])/;
const SHIFT_START_EVENT = "started";
const SHIFT_PROGRESS_EVENTS = new Set(["progress_updated", "handed_over", "completed"]);

function getShiftNumber(value: string | number | null) {
  const match = String(value ?? "").match(SHIFT_NUMBER);
  return match ? Number(match[1]) : null;
}

function eventTime(event: PicWorkEvent) {
  return new Date(event.createdAt).getTime();
}

function progressAllocation(record: PicUsageRecord, events: PicWorkEvent[]): ProgressAllocation {
  const shift = getShiftNumber(record.shift);
  if (shift === null || events.length === 0) return { deltaPct: null, estimated: true };

  const ordered = [...events].sort((a, b) => eventTime(a) - eventTime(b) || a.id - b.id);
  const recordUpdatedAt = new Date(record.updatedAt).getTime();
  const usageEvents = ordered.filter((event) =>
    event.eventType === "paint_usage_recorded" && getShiftNumber(event.shift) === shift,
  );
  const matchingUsageEvent = usageEvents.reduce<PicWorkEvent | null>((closest, event) => {
    if (!closest) return event;
    const eventDistance = Math.abs(eventTime(event) - recordUpdatedAt);
    const closestDistance = Math.abs(eventTime(closest) - recordUpdatedAt);
    return eventDistance < closestDistance ? event : closest;
  }, null);
  const anchorTime = matchingUsageEvent ? eventTime(matchingUsageEvent) : recordUpdatedAt;

  const shiftStarts = ordered.filter((event) =>
    event.eventType === SHIFT_START_EVENT
      && getShiftNumber(event.shift) === shift
      && eventTime(event) <= anchorTime
      && event.progressPct !== null,
  );
  const startEvent = shiftStarts.at(-1) ?? null;
  const startTime = startEvent ? eventTime(startEvent) : anchorTime;
  const nextShiftStart = ordered.find((event) =>
    event.eventType === SHIFT_START_EVENT
      && (getShiftNumber(event.shift) ?? 0) > shift
      && eventTime(event) > startTime,
  );
  const nextShiftStartTime = nextShiftStart ? eventTime(nextShiftStart) : Number.POSITIVE_INFINITY;

  const shiftProgress = ordered.filter((event) =>
    SHIFT_PROGRESS_EVENTS.has(event.eventType)
      && getShiftNumber(event.shift) === shift
      && event.progressPct !== null
      && eventTime(event) >= startTime
      && eventTime(event) < nextShiftStartTime,
  );
  const endEvent = shiftProgress.at(-1) ?? null;

  let startPct = startEvent?.progressPct ?? null;
  let startWasInferred = false;
  if (startPct === null && shift === 1) {
    startPct = 0;
    startWasInferred = true;
  } else if (startPct === null) {
    const previousShiftEvent = ordered
      .filter((event) =>
        (getShiftNumber(event.shift) ?? 0) < shift
          && event.progressPct !== null
          && eventTime(event) <= startTime
          && SHIFT_PROGRESS_EVENTS.has(event.eventType),
      )
      .at(-1);
    if (previousShiftEvent?.progressPct !== null && previousShiftEvent?.progressPct !== undefined) {
      startPct = previousShiftEvent.progressPct;
      startWasInferred = true;
    }
  }

  let endPct = endEvent?.progressPct ?? matchingUsageEvent?.progressPct ?? null;
  const endWasInferred = endEvent === null && endPct !== null;
  if (startPct === null || endPct === null) {
    return { deltaPct: null, estimated: true };
  }

  if (endPct < startPct) {
    return { deltaPct: 0, estimated: true };
  }
  const deltaPct = Math.min(100 - startPct, endPct - startPct);
  const hasRecordedStartAndEnd = startEvent !== null && endEvent !== null;
  return {
    deltaPct: Math.max(0, deltaPct),
    estimated: !hasRecordedStartAndEnd || startWasInferred || endWasInferred,
  };
}

function targetLiters(record: PicUsageRecord, workflow: PicWorkflowItem | undefined) {
  if (workflow) return workflow.targetTotalL;
  return record.primerTargetTotalL + record.topcoatTargetTotalL
    + record.customPaintActuals.reduce((sum, stage) => sum + stage.targetLiters, 0);
}

function actualLiters(record: PicUsageRecord) {
  return record.primerActualTotalL + record.topcoatActualTotalL
    + record.customPaintActuals.reduce((sum, stage) => sum + stage.actualLiters, 0);
}

export function buildPicPerformance<
  TUsage extends PicUsageRecord,
  TEvent extends PicWorkEvent,
  TWorkflow extends PicWorkflowItem,
>(
  records: TUsage[],
  histories: Map<number, TEvent[]>,
  workflows: Map<number, TWorkflow>,
  unassignedLabel: string,
): PicPerformanceRow[] {
  const rows = new Map<string, PicPerformanceRow & { serialIds: Set<number>; jobIds: Set<number> }>();

  for (const record of records) {
    const key = record.operatorUserId === null ? "unassigned" : String(record.operatorUserId);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        operatorName: record.operatorName ?? unassignedLabel,
        recordCount: 0,
        serialCount: 0,
        jobCount: 0,
        allActualL: 0,
        expectedL: 0,
        scoredActualL: 0,
        varianceL: null,
        variancePct: null,
        overconsumptionCount: 0,
        scoredShiftCount: 0,
        estimatedShiftCount: 0,
        unscoredShiftCount: 0,
        serialIds: new Set(),
        jobIds: new Set(),
      };
      rows.set(key, row);
    }

    row.recordCount += 1;
    row.serialIds.add(record.serialNumberId);
    row.jobIds.add(record.jobItemId);
    const actualL = actualLiters(record);
    row.allActualL += actualL;
    const progress = progressAllocation(record, histories.get(record.serialNumberId) ?? []);
    if (progress.deltaPct === null || progress.deltaPct <= 0) {
      row.unscoredShiftCount += 1;
      continue;
    }

    const expectedL = targetLiters(record, workflows.get(record.serialNumberId)) * progress.deltaPct / 100;
    if (expectedL <= 0) {
      row.unscoredShiftCount += 1;
      continue;
    }

    row.scoredShiftCount += 1;
    if (progress.estimated) row.estimatedShiftCount += 1;
    row.expectedL += expectedL;
    row.scoredActualL += actualL;
    if (actualL > expectedL * (1 + record.thresholdPct / 100)) row.overconsumptionCount += 1;
  }

  return [...rows.values()]
    .map(({ serialIds, jobIds, ...row }) => ({
      ...row,
      serialCount: serialIds.size,
      jobCount: jobIds.size,
      varianceL: row.scoredShiftCount > 0 ? row.expectedL - row.scoredActualL : null,
      variancePct: row.expectedL > 0 ? ((row.expectedL - row.scoredActualL) / row.expectedL) * 100 : null,
    }))
    .sort((a, b) => (b.variancePct ?? Number.NEGATIVE_INFINITY) - (a.variancePct ?? Number.NEGATIVE_INFINITY)
      || b.expectedL - a.expectedL
      || a.operatorName.localeCompare(b.operatorName));
}
