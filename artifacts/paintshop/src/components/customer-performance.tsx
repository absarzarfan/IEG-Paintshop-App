import { Link } from "wouter";
import type { CustomerPerformance } from "@workspace/api-client-react";
import { useLanguage } from "@/lib/language";

export function CustomerPerformanceReport({ customers }: { customers: CustomerPerformance[] }) {
  const { language, t } = useLanguage();
  const labels = language === "id" ? {
    title: "Plan vs Actual per Customer",
    note: "Target adalah total seluruh qty JN. Expected mengikuti progres; hijau = penghematan material, merah = melebihi biaya/liter yang diharapkan pada progres saat ini.",
    empty: "Belum ada order. Tambahkan customer, qty, dan target di Job & Serial.",
    plan: "Plan Total",
    remaining: "Sisa dari plan",
    materialCost: "Biaya Material",
    estimate: "Biaya dihitung dari harga material saat ini. Tahap tambahan menggunakan estimasi biaya/liter dari resep primer atau topcoat JN. Ini bukan laba bersih penjualan.",
  } : {
    title: "Customer Plan vs Actual",
    note: "Targets cover the full JN quantity. Expected usage follows progress; green means material savings, red means usage/cost above the allowance at current progress.",
    empty: "No orders yet. Add a customer, quantity, and target in Job & Serial.",
    plan: "Total Plan",
    remaining: "Remaining from plan",
    materialCost: "Material Cost",
    estimate: "Costs use current material prices. Additional stages estimate cost/liter from the JN primer or topcoat recipe. These are not net sales profits.",
  };
  const number = (value: number) => value.toLocaleString(language === "id" ? "id-ID" : "en-GB", { maximumFractionDigits: 2 });
  const money = (value: number | null, currency: string | null) => value === null || !currency ? "—" : `${currency} ${number(value)}`;
  const tone = (value: number | null) => value === null ? "text-muted-foreground" : value >= 0 ? "text-emerald-700" : "text-destructive";
  return (
    <section className="border border-border bg-card" data-testid="customer-performance">
      <div className="border-b border-border bg-secondary/20 p-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wide">{labels.title}</h2>
        <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">{labels.note}</p>
      </div>
      {customers.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{labels.empty}</p> : (
        <div className="divide-y divide-border">
          {customers.map((customer) => (
            <details open key={customer.customerName} className="p-4" data-testid={`customer-${customer.customerName}`}>
              <summary className="cursor-pointer text-sm font-extrabold">{customer.customerName} <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{customer.quantity} items · {number(customer.progressPct)}%</span></summary>
              <div className="my-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 xl:grid-cols-6">
                {[
                  [labels.plan, `${number(customer.targetTotalL)} L`],
                  [t("expected"), `${number(customer.expectedProgressLiters)} L`],
                  [t("actual"), `${number(customer.actualTotalL)} L`],
                  [labels.remaining, `${number(customer.remainingLiters)} L`],
                ].map(([label, value]) => <div key={label} className="border border-border bg-secondary/10 p-3"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-mono font-bold">{value}</p></div>)}
                <div className="border border-border p-3"><p className="text-muted-foreground">{t("variance")} (L)</p><p className={`mt-1 font-mono font-bold ${tone(customer.literVariance)}`}>{number(customer.literVariance)} L {customer.literVariancePct === null ? "" : `(${number(customer.literVariancePct)}%)`}</p></div>
                <div className="border border-border p-3"><p className="text-muted-foreground">{customer.materialCostVariance === null ? labels.materialCost : customer.materialCostVariance >= 0 ? t("savings") : t("overrun")}</p><p className={`mt-1 font-mono font-bold ${tone(customer.materialCostVariance)}`}>{money(customer.materialCostVariance, customer.materialCostCurrency)}</p><p className="text-[10px]">{customer.materialCostVariancePct === null ? "" : `${number(customer.materialCostVariancePct)}%`}</p></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-xs">
                  <thead className="bg-secondary/40 text-[10px] uppercase text-muted-foreground"><tr>{["JN", "Qty", t("progress"), `${labels.plan} (L)`, `${t("expected")} (L)`, `${t("actual")} (L)`, `${t("variance")} (L)`, `${labels.materialCost} (${t("actual")} / ${t("expected")})`, t("variance")].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
                  <tbody>{customer.orders.map((order) => <tr key={order.jobItemId} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 font-mono font-bold"><Link href={`/job-items/${order.jobItemId}`} className="text-primary hover:underline">{order.jobNo}</Link></td>
                    <td className="px-3 py-3">{order.quantity}</td><td className="px-3 py-3">{number(order.progressPct)}%</td>
                    <td className="px-3 py-3">{number(order.targetTotalL)}</td><td className="px-3 py-3">{number(order.expectedProgressLiters)}</td><td className="px-3 py-3">{number(order.actualTotalL)}</td>
                    <td className={`px-3 py-3 font-bold ${tone(order.literVariance)}`}>{number(order.literVariance)}</td>
                    <td className="px-3 py-3 font-mono">{money(order.actualMaterialCost, order.materialCostCurrency)} / {money(order.expectedMaterialCost, order.materialCostCurrency)}</td>
                    <td className={`px-3 py-3 font-mono font-bold ${tone(order.materialCostVariance)}`}>{money(order.materialCostVariance, order.materialCostCurrency)}{order.materialCostVariancePct !== null && <span className="block text-[10px]">{number(order.materialCostVariancePct)}%</span>}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              {customer.materialCostVariance === null && <p className="mt-2 text-xs text-muted-foreground">{t("costUnavailable")}</p>}
            </details>
          ))}
        </div>
      )}
      <p className="border-t border-border p-4 text-[11px] leading-relaxed text-muted-foreground">{labels.estimate}</p>
    </section>
  );
}
