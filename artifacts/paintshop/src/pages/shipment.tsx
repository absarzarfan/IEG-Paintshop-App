import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListJobWorkflowQueryKey, useListJobWorkflow, useUpdateJobWorkflow, type JobWorkflowItem } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, PackageCheck, Truck } from "lucide-react";
import { useAppAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";

function currency(value: number | null, code: string | null, language: "id" | "en") {
  if (value === null) return "—";
  return new Intl.NumberFormat(language === "id" ? "id-ID" : "en-US", { style: "currency", currency: code || "IDR", maximumFractionDigits: 0 }).format(value);
}

function ShipmentRow({ item, canVerify, verify, busy }: { item: JobWorkflowItem; canVerify: boolean; verify: (item: JobWorkflowItem) => void; busy: boolean }) {
  const { t, language } = useLanguage();
  const delta = item.materialCostVariance;
  const saving = delta !== null && delta >= 0;
  const literDelta = item.literVariance;
  const varianceTone = delta === null ? "text-muted-foreground" : saving ? "text-emerald-700" : "text-destructive";
  return <div className="grid gap-4 border-b border-border p-4 lg:grid-cols-[1fr_1.2fr_auto] lg:items-center" data-testid={`row-shipment-${item.serialNumberId}`}>
    <div><div className="flex flex-wrap gap-2"><span className="font-mono font-extrabold text-primary">{item.jobNo}</span><span className="font-mono font-bold">{item.serialNo}</span></div><p className="mt-1 text-sm font-semibold">{item.customerName}</p><p className="text-xs text-muted-foreground">{item.description} · {item.progressPct}%</p><span className="mt-2 inline-flex border border-border px-2 py-0.5 text-[10px] font-bold uppercase">{item.workStatus === "shipped" ? t("shipped") : t("shipmentPending")}</span></div>
    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><div><p className="text-muted-foreground">{t("expected")}</p><p className="mt-1 font-mono font-bold">{currency(item.expectedMaterialCost, item.materialCostCurrency, language)}</p></div><div><p className="text-muted-foreground">{t("actual")}</p><p className="mt-1 font-mono font-bold">{currency(item.actualMaterialCost, item.materialCostCurrency, language)}</p></div><div><p className="text-muted-foreground">{t("variance")}</p><p className={`mt-1 font-mono font-extrabold ${varianceTone}`}>{delta === null ? "—" : currency(Math.abs(delta), item.materialCostCurrency, language)} <span className="block text-[10px]">{delta === null ? t("costUnavailable") : saving ? t("savings") : t("overrun")}</span>{item.materialCostVariancePct !== null && <span className="block text-[10px]">{Math.abs(item.materialCostVariancePct).toFixed(1)}% {saving ? t("savingPct") : t("lossPct")}</span>}</p></div><div><p className="text-muted-foreground">{t("liters")}</p><p className={`mt-1 font-mono font-extrabold ${literDelta >= 0 ? "text-emerald-700" : "text-destructive"}`}>{Math.abs(literDelta).toFixed(2)} L <span className="block text-[10px]">{literDelta >= 0 ? t("leftover") : t("excess")}</span></p></div></div>
    {item.customPaintStages.length > 0 && <div className="grid gap-2 sm:grid-cols-2 lg:col-span-3">{item.customPaintStages.map(stage => <div key={stage.id} className="border border-border bg-secondary/20 p-3"><p className="font-bold">{stage.name}<span className="ml-2 text-[10px] uppercase text-muted-foreground">{stage.coatType}</span></p><p className="mt-1 text-xs text-muted-foreground">{t("targetPerSerial")} {stage.targetLiters.toFixed(2)} L · {t("actual")} {stage.actualLiters.toFixed(2)} L</p><p className={`mt-1 text-xs font-bold ${stage.costVariance === null ? "text-muted-foreground" : stage.costVariance >= 0 ? "text-emerald-700" : "text-destructive"}`}>{stage.costVariance === null ? t("costUnavailable") : `${stage.costVariance >= 0 ? t("savings") : t("overrun")}: ${currency(Math.abs(stage.costVariance), item.materialCostCurrency, language)}`}</p></div>)}</div>}
    {item.workStatus === "shipment" && canVerify && <Button onClick={() => verify(item)} disabled={busy} data-testid={`button-verify-shipment-${item.serialNumberId}`}><CheckCircle2 size={15} className="mr-2"/>{t("verify")}</Button>}
  </div>;
}

export function Shipment() {
  const { user } = useAppAuth();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const query = useListJobWorkflow(undefined, { query: { queryKey: getListJobWorkflowQueryKey() } });
  const mutation = useUpdateJobWorkflow();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const items = useMemo(() => (query.data ?? []).filter(item => item.workStatus === "shipment" || item.workStatus === "shipped"), [query.data]);
  const canVerify = user?.role === "painter" && user.isPaintLeader;
  async function verify(item: JobWorkflowItem) {
    setError(""); setPending(item.serialNumberId);
    try {
      await mutation.mutateAsync({ id: item.serialNumberId, data: { action: "verify_shipment" } });
      await qc.invalidateQueries({ queryKey: getListJobWorkflowQueryKey() });
    } catch (e) { setError(e instanceof Error ? e.message : t("error")); }
    finally { setPending(null); }
  }
  return <div className="space-y-5 pb-10">
    <header className="border-b border-border pb-5"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-primary"><Truck size={15}/> IEG / Dispatch</p><h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">{t("shipment")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("shipmentNote")}</p></header>
    {error && <div className="flex gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" data-testid="error-shipment"><AlertTriangle size={16}/>{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2"><div className="border border-border bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("shipmentPending")}</p><p className="mt-1 font-mono text-2xl font-extrabold">{items.filter(i=>i.workStatus==="shipment").length}</p></div><div className="border border-border bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("shipped")}</p><p className="mt-1 font-mono text-2xl font-extrabold">{items.filter(i=>i.workStatus==="shipped").length}</p></div></div>
    <section className="border border-border bg-card"><div className="flex items-center gap-2 border-b border-border bg-secondary/25 px-4 py-3"><PackageCheck size={16} className="text-primary"/><h2 className="text-xs font-extrabold uppercase tracking-widest">{t("shipment")} / {items.length}</h2></div>
      {query.isLoading ? <div className="space-y-3 p-5"><div className="h-20 animate-pulse bg-muted"/><div className="h-20 animate-pulse bg-muted"/></div> : query.error ? <p className="p-10 text-center font-bold text-destructive">{t("error")}</p> : !items.length ? <p className="p-12 text-center text-sm text-muted-foreground">{t("noShipment")}</p> : items.map(item=><ShipmentRow key={item.serialNumberId} item={item} canVerify={canVerify} verify={verify} busy={pending===item.serialNumberId}/>)}
    </section>
  </div>;
}
