export interface MaterialPriceInfo {
  unitPrice: number;
  currency: string;
}

/** Unused components cost zero; unpriced positive volumes remain unknown. */
export function priceMaterialVolumes(volumes: number[], prices: (MaterialPriceInfo | null)[]) {
  const currencies = new Set(
    prices.filter((price, index) => volumes[index] > 0 && price !== null)
      .map((price) => price!.currency),
  );
  const currency = currencies.size === 1 ? [...currencies][0]! : null;
  const round = (value: number) => Math.round(value * 10000) / 10000;
  const costs = volumes.map((volume, index) => {
    if (volume === 0) return 0;
    const price = prices[index];
    if (!price || !currency || price.currency !== currency) return null;
    return round(volume * price.unitPrice);
  });
  const total = costs.some((cost) => cost === null)
    ? null
    : round(costs.reduce<number>((sum, cost) => sum + cost!, 0));
  return { currency, costs, total };
}
