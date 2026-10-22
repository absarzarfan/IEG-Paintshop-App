import assert from "node:assert/strict";
import test from "node:test";
import { priceMaterialVolumes } from "./materialCostMath";

test("demo recipe prices only the two used components", () => {
  const usd = { unitPrice: 10, currency: "USD" };
  const prices = [usd, null, null, usd, null, null];
  assert.equal(priceMaterialVolumes([4, 0, 0, 6, 0, 0], prices).total, 100);
  const actual = priceMaterialVolumes([4, 0, 0, 5.5, 0, 0], prices);
  assert.equal(actual.total, 95);
  assert.equal(actual.currency, "USD");
  assert.deepEqual(actual.costs, [40, 0, 0, 55, 0, 0]);
});

test("missing prices for consumed material are never treated as zero", () => {
  assert.equal(priceMaterialVolumes([4, 1], [{ unitPrice: 10, currency: "USD" }, null]).total, null);
});

test("unused foreign-currency components do not invalidate the recipe", () => {
  assert.equal(priceMaterialVolumes([4, 0], [
    { unitPrice: 10, currency: "USD" }, { unitPrice: 5, currency: "EUR" },
  ]).total, 40);
});

test("consuming mixed currencies leaves cost unknown", () => {
  assert.equal(priceMaterialVolumes([4, 1], [
    { unitPrice: 10, currency: "USD" }, { unitPrice: 5, currency: "EUR" },
  ]).total, null);
});

test("a zero-volume recipe has zero cost without prices", () => {
  assert.equal(priceMaterialVolumes([0, 0], [null, null]).total, 0);
});
