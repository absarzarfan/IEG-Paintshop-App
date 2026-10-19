import assert from "node:assert/strict";
import test from "node:test";
import type { JobItem } from "@workspace/db";
import { aggregateOrderPerformance, progressVariance } from "./orderPerformance";

function job(id: number, quantity: number, target: number, changes: Partial<JobItem> = {}): JobItem {
  return {
    id, jobNo: `B${id}`, customerName: "Caterpillar", orderQuantity: quantity,
    targetBasis: "order_total", primerBaseL: target, primerHrdL: 0, primerThinnerL: 0,
    topcoatBaseL: 0, topcoatHrdL: 0, topcoatThinnerL: 0, customPaintStages: [],
    ...changes,
  } as JobItem;
}

const orders = [job(123, 70, 250), job(234, 20, 120), job(345, 10, 60)];
function serials(progressPct: number, actualTotalL: number) {
  return orders.flatMap((order) => Array.from({ length: order.orderQuantity }, () => ({
    jobItemId: order.id, progressPct,
    expectedProgressLiters: order.primerBaseL / order.orderQuantity * progressPct / 100,
    actualTotalL: actualTotalL / 100,
    expectedMaterialCost: order.primerBaseL / order.orderQuantity * progressPct / 100 * 10,
    actualMaterialCost: actualTotalL / 100 * 10,
    materialCostCurrency: "MYR",
  })));
}

test("100 items, 430 L plan, 420 L actual at completion gives 10 L and MYR 100 savings", () => {
  const [customer] = aggregateOrderPerformance(orders, serials(100, 420));
  assert.equal(customer.quantity, 100);
  assert.equal(customer.progressPct, 100);
  assert.equal(customer.targetTotalL, 430);
  assert.equal(customer.expectedProgressLiters, 430);
  assert.equal(customer.actualTotalL, 420);
  assert.equal(customer.remainingLiters, 10);
  assert.equal(customer.literVariance, 10);
  assert.equal(customer.literVariancePct, 2.3256);
  assert.equal(customer.materialCostVariance, 100);
  assert.equal(customer.orders.length, 3);
});

test("80% progress with 420 L actual is over budget, even though 10 L remains from the full plan", () => {
  const [customer] = aggregateOrderPerformance(orders, serials(80, 420));
  assert.equal(customer.progressPct, 80);
  assert.equal(customer.expectedProgressLiters, 344);
  assert.equal(customer.remainingLiters, 10);
  assert.equal(customer.literVariance, -76);
  assert.equal(customer.literVariancePct, -22.093);
  assert.equal(customer.materialCostVariance, -760);
});

test("unregistered serials retain the full order plan and do not count as progress", () => {
  const [customer] = aggregateOrderPerformance(orders, []);
  assert.equal(customer.targetTotalL, 430);
  assert.equal(customer.progressPct, 0);
  assert.equal(customer.expectedProgressLiters, 0);
  assert.equal(customer.materialCostVariance, null);
});

test("additional stage targets cover the entire order and are not multiplied twice", () => {
  const [customer] = aggregateOrderPerformance([job(1, 10, 100, {
    customPaintStages: [{ id: "second", name: "Second Coat", coatType: "topcoat", targetLitersTotal: 20 }],
  })], []);
  assert.equal(customer.targetTotalL, 120);
});

test("legacy per-unit target basis remains per-unit", () => {
  const [customer] = aggregateOrderPerformance([job(1, 10, 2, { targetBasis: "per_unit" })], []);
  assert.equal(customer.targetTotalL, 20);
});

test("mixed currencies must not produce a false customer profit", () => {
  const rows = serials(100, 420);
  rows[0].materialCostCurrency = "USD";
  const [customer] = aggregateOrderPerformance(orders, rows);
  assert.equal(customer.materialCostCurrency, null);
  assert.equal(customer.materialCostVariance, null);
});

test("unavailable prices must not become zero costs", () => {
  const rows = serials(100, 420).map((row, index) => ({
    ...row, actualMaterialCost: index === 0 ? null : row.actualMaterialCost,
  }));
  const [customer] = aggregateOrderPerformance(orders, rows);
  assert.equal(customer.actualMaterialCost, null);
  assert.equal(customer.materialCostVariance, null);
});

test("zero expected allowance does not produce infinity or a fabricated percentage", () => {
  assert.deepEqual(progressVariance(0, 2), { variance: -2, variancePct: null });
});
