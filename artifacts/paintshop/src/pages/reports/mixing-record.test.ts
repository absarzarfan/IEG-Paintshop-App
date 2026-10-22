import assert from "node:assert/strict";
import test from "node:test";
import type { JobItem, JobWorkflowItem, PaintUsage } from "@workspace/api-client-react";
import { buildMixingRows } from "./mixing-record";

const job = (changes: Partial<JobItem> = {}) => ({
  id: 1, jobNo: "B123", customerName: "Customer", description: "Part", orderQuantity: 1,
  targetBasis: "order_total", customPaintStages: [],
  primerBaseL: 4, primerHrdL: 0, primerThinnerL: 0,
  topcoatBaseL: 6, topcoatHrdL: 0, topcoatThinnerL: 0,
  ...changes,
}) as JobItem;
const usage = (changes: Partial<PaintUsage> = {}) => ({
  id: 1, jobItemId: 1, jobNo: "B123", serialNumberId: 10, serialNo: "SN1",
  usageDate: "2026-10-22", shift: "1", operatorName: "Mixer",
  primerBaseActualL: 4, primerHrdActualL: 0, primerThinnerActualL: 0, primerActualTotalL: 4,
  topcoatBaseActualL: 0, topcoatHrdActualL: 0, topcoatThinnerActualL: 0, topcoatActualTotalL: 0,
  customPaintActuals: [], ...changes,
}) as PaintUsage;
const work = (changes: Partial<JobWorkflowItem> = {}) => ({
  serialNumberId: 10, jobItemId: 1, serialNo: "SN1", progressPct: 100, ...changes,
}) as JobWorkflowItem;

test("sums shifts once, preserving dates and PIC without duplicating the order budget", () => {
  const first = usage();
  const second = usage({ id: 2, shift: "2", primerBaseActualL: 0, primerActualTotalL: 0, topcoatBaseActualL: 5.5, topcoatActualTotalL: 5.5, operatorName: "Mixer2" });
  const [row] = buildMixingRows([job()], [first, second, first], [work()]);
  assert.equal(row.totalTarget, 10);
  assert.equal(row.totalActual, 9.5);
  assert.equal(row.totalRemaining, 0.5);
  assert.equal(row.exceeded, false);
  assert.deepEqual(row.operators, ["Mixer", "Mixer2"]);
  assert.deepEqual(row.serials, ["SN1"]);
  assert.equal(row.components[3].remaining, 0.5);
});

test("whole-order quantity never multiplies target again; incomplete savings are progress-adjusted", () => {
  const [row] = buildMixingRows(
    [job({ orderQuantity: 5, primerBaseL: 430, topcoatBaseL: 0 })],
    [usage({ primerBaseActualL: 420, primerActualTotalL: 420 })],
    [work(), work({ serialNumberId: 11 }), work({ serialNumberId: 12 }), work({ serialNumberId: 13 })],
  );
  assert.equal(row.totalTarget, 430);
  assert.equal(row.progressPct, 80);
  assert.equal(row.expectedTotal, 344);
  assert.equal(row.totalRemaining, 10);
  assert.equal(row.progressVariance, -76);
  assert.equal(row.exceeded, true);
  assert.equal(row.planExceeded, false);
});

test("legacy per-unit recipes scale once by order quantity", () => {
  const [row] = buildMixingRows([job({ targetBasis: "per_unit", orderQuantity: 7 })], [], []);
  assert.equal(row.totalTarget, 70);
  assert.equal(row.components[0].target, 28);
});

test("a component overrun remains visible even when the total is under budget", () => {
  const [row] = buildMixingRows([job()], [usage({ primerBaseActualL: 4.5, primerActualTotalL: 4.5 })], [work()]);
  assert.equal(row.components[0].remaining, -0.5);
  assert.equal(row.totalRemaining, 5.5);
});

test("add-on budgets are not repeated across shifts; orphaned stage snapshots remain counted", () => {
  const custom = { stageId: "touch-up", name: "Touch up", coatType: "topcoat" as const, targetLiters: 1, actualLiters: 0.4 };
  const entries = [usage({ customPaintActuals: [custom] }), usage({ id: 2, customPaintActuals: [custom] })];
  const configured = job({ customPaintStages: [{ id: "touch-up", name: "Touch up", coatType: "topcoat", targetLitersTotal: 1 }] });
  for (const recipe of [configured, job()]) {
    const [row] = buildMixingRows([recipe], entries, [work()]);
    assert.deepEqual(row.addOns, [{ name: "Touch up", target: 1, actual: 0.8, remaining: 0.2 }]);
    assert.equal(row.totalTarget, 11);
  }
});

test("missing recipes are explicitly flagged rather than silently dropped", () => {
  const [row] = buildMixingRows([], [usage()], []);
  assert.equal(row.missingJob, true);
  assert.equal(row.totalActual, 4);
});
