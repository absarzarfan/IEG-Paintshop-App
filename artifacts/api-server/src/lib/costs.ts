import { eq, desc } from "drizzle-orm";
import { db, materialPricesTable, type JobItem } from "@workspace/db";

const targetFields = [
  "primerBaseL",
  "primerHrdL",
  "primerThinnerL",
  "topcoatBaseL",
  "topcoatHrdL",
  "topcoatThinnerL",
] as const;

/**
 * New orders store targets for the whole JN quantity. Workflow and usage
 * variance are per physical serial, so convert those targets at the boundary.
 * Legacy records remain per-unit by default.
 */
export function targetsPerUnit(jobItem: JobItem): JobItem {
  if (jobItem.targetBasis !== "order_total") return jobItem;
  const quantity = Math.max(jobItem.orderQuantity, 1);
  const normalized = { ...jobItem };
  for (const field of targetFields) {
    normalized[field] = normalized[field] / quantity;
  }
  return normalized;
}

interface MaterialPriceInfo {
  unitPrice: number;
  currency: string;
}

async function getCurrentPrice(materialId: number | null): Promise<MaterialPriceInfo | null> {
  if (materialId == null) return null;
  const [latest] = await db
    .select({ unitPrice: materialPricesTable.unitPrice, currency: materialPricesTable.currency })
    .from(materialPricesTable)
    .where(eq(materialPricesTable.materialId, materialId))
    .orderBy(desc(materialPricesTable.effectiveDate), desc(materialPricesTable.createdAt))
    .limit(1);
  return latest ?? null;
}

export async function getCurrentMaterialPrice(materialId: number | null): Promise<MaterialPriceInfo | null> {
  return getCurrentPrice(materialId);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function sumOrNull(...vals: (number | null)[]): number | null {
  return vals.some((v) => v === null) ? null : round4((vals as number[]).reduce((a, b) => a + b, 0));
}

export interface JobItemCostInputs {
  primerBaseL: number;
  primerHrdL: number;
  primerThinnerL: number;
  topcoatBaseL: number;
  topcoatHrdL: number;
  topcoatThinnerL: number;
  primerBaseMaterialId: number | null;
  primerHrdMaterialId: number | null;
  primerThinnerMaterialId: number | null;
  topcoatBaseMaterialId: number | null;
  topcoatHrdMaterialId: number | null;
  topcoatThinnerMaterialId: number | null;
}

/**
 * Derives a job item's cost preview from current material prices. Never
 * stored -- always computed at read time so a later price change is
 * reflected immediately and old costs are never silently stale. Returns null
 * for a line (and for the whole currency) whenever a role has no material
 * assigned, that material has no price recorded yet, or the assigned
 * materials mix currencies -- showing a wrong number is worse than showing
 * none.
 */
export async function computeJobItemCosts(jobItem: JobItemCostInputs) {
  const [primerBasePrice, primerHrdPrice, primerThinnerPrice, topcoatBasePrice, topcoatHrdPrice, topcoatThinnerPrice] =
    await Promise.all([
      getCurrentPrice(jobItem.primerBaseMaterialId),
      getCurrentPrice(jobItem.primerHrdMaterialId),
      getCurrentPrice(jobItem.primerThinnerMaterialId),
      getCurrentPrice(jobItem.topcoatBaseMaterialId),
      getCurrentPrice(jobItem.topcoatHrdMaterialId),
      getCurrentPrice(jobItem.topcoatThinnerMaterialId),
    ]);

  const allPrices = [primerBasePrice, primerHrdPrice, primerThinnerPrice, topcoatBasePrice, topcoatHrdPrice, topcoatThinnerPrice];
  const currencies = new Set(allPrices.filter((p): p is MaterialPriceInfo => p !== null).map((p) => p.currency));
  const consistentCurrency = currencies.size === 1 ? [...currencies][0]! : null;

  const costFor = (liters: number, price: MaterialPriceInfo | null): number | null => {
    if (!price || !consistentCurrency || price.currency !== consistentCurrency) return null;
    return round4(liters * price.unitPrice);
  };

  const primerCostBase = costFor(jobItem.primerBaseL, primerBasePrice);
  const primerCostHrd = costFor(jobItem.primerHrdL, primerHrdPrice);
  const primerCostThinner = costFor(jobItem.primerThinnerL, primerThinnerPrice);
  const topcoatCostBase = costFor(jobItem.topcoatBaseL, topcoatBasePrice);
  const topcoatCostHrd = costFor(jobItem.topcoatHrdL, topcoatHrdPrice);
  const topcoatCostThinner = costFor(jobItem.topcoatThinnerL, topcoatThinnerPrice);

  return {
    currency: consistentCurrency,
    primerCostBase,
    primerCostHrd,
    primerCostThinner,
    primerCostTotal: sumOrNull(primerCostBase, primerCostHrd, primerCostThinner),
    topcoatCostBase,
    topcoatCostHrd,
    topcoatCostThinner,
    topcoatCostTotal: sumOrNull(topcoatCostBase, topcoatCostHrd, topcoatCostThinner),
  };
}

export async function computePaintUsageCost(
  jobItem: JobItemCostInputs,
  actuals: Pick<
    JobItemCostInputs,
    "primerBaseL" | "primerHrdL" | "primerThinnerL" | "topcoatBaseL" | "topcoatHrdL" | "topcoatThinnerL"
  >,
) {
  const materialIds = [
    jobItem.primerBaseMaterialId,
    jobItem.primerHrdMaterialId,
    jobItem.primerThinnerMaterialId,
    jobItem.topcoatBaseMaterialId,
    jobItem.topcoatHrdMaterialId,
    jobItem.topcoatThinnerMaterialId,
  ];
  const prices = await Promise.all(materialIds.map(getCurrentPrice));
  const currencies = new Set(prices.filter((price): price is MaterialPriceInfo => price !== null).map((price) => price.currency));
  const currency = currencies.size === 1 ? [...currencies][0]! : null;
  if (!currency || prices.some((price) => !price || price.currency !== currency)) {
    return { currency: null, total: null };
  }

  const total =
    actuals.primerBaseL * prices[0]!.unitPrice +
    actuals.primerHrdL * prices[1]!.unitPrice +
    actuals.primerThinnerL * prices[2]!.unitPrice +
    actuals.topcoatBaseL * prices[3]!.unitPrice +
    actuals.topcoatHrdL * prices[4]!.unitPrice +
    actuals.topcoatThinnerL * prices[5]!.unitPrice;
  return { currency, total: round4(total) };
}
