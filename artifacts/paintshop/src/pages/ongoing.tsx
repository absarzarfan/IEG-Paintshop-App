import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getListJobWorkflowHistoryQueryKey, getListJobWorkflowQueryKey, useListJobWorkflow, useUpdateJobWorkflow, type JobWorkflowItem } from "@workspace/api-client-react";
import { AlertTriangle, ClipboardList, Loader2, Play, RefreshCw, Send, Check } from "lucide-react";
import { useAppAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SerialWorkHistory } from "@/components/serial-work-history";

const categories = ["preparation", "blasting", "washing", "cleaning", "finishing"] as const;

function formatCurrency(value: number | null, currencyCode: string | null, language: "id" | "en") {
  if (value === null) return "—";
  return new Intl.NumberFormat(language === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency: currencyCode || "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function WorkflowRow({ item, canWork, canComplete, shift, onAction, pendingId }: { item: JobWorkflowItem; canWork: boolean; canComplete: boolean; shift: number; onAction: (item: JobWorkflowItem, action: string, values?: Record<string, unknown>) => void; pendingId: number | null }) {
  const { t, language } = useLanguage();
  const [progressPct, setProgress] = useState(String(item.progressPct));
  const [category, setCategory] = useState(item.currentCategory ?? "preparation");
  const [note, setNote] = useState("");
  const nextShift = shift < 3 ? shift + 1 : null;
  const isQueued = item.workStatus === "queued";
  const canResume = item.workStatus === "ongoing" && item.handoverToShift === shift;
  return <article className="grid gap-4 border-b border-border p-4 lg:grid-cols-[1.1fr_.7fr_1fr] lg:p-5" data-testid={`row-workflow-${item.serialNumberId}`}>
    <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-extrabold text-primary">{item.jobNo}</span><span className="font-mono text-sm font-bold">{item.serialNo}</span><span className="border border-border bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase">{t(item.workStatus === "queued" ? "queued" : item.workStatus === "ongoing" ? "active" : item.workStatus)}</span></div><p className="mt-1 text-sm font-semibold">{item.customerName}</p><p className="text-xs text-muted-foreground">{item.description}</p><p className="mt-2 text-xs text-muted-foreground">{t("shift")} {item.activeShift}{item.handoverToShift ? ` → ${item.handoverToShift}` : ""}{item.currentCategory ? ` · ${t(item.currentCategory)}` : ""}</p>
      <div className="mt-3"><SerialWorkHistory serialNumberId={item.serialNumberId} testId={`button-history-${item.serialNumberId}`} /></div>
    </div>
    <div><div className="flex items-center justify-between text-xs"><span className="font-bold uppercase tracking-wider text-muted-foreground">{t("progress")}</span><span className="font-mono font-bold">{item.progressPct}%</span></div><div className="mt-2 h-2 bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${item.progressPct}%` }}/></div><p className="mt-2 text-xs text-muted-foreground">{item.actualTotalL.toFixed(2)} / {item.expectedProgressLiters.toFixed(2)} L {t("expected").toLowerCase()}</p><p className={`mt-1 text-xs font-bold ${item.literVariance >= 0 ? "text-emerald-700" : "text-destructive"}`}>{Math.abs(item.literVariance).toFixed(2)} L {item.literVariance >= 0 ? t("leftover") : t("excess")}</p><div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs"><div><p className="text-muted-foreground">{t("expected")}</p><p className="font-mono font-semibold">{formatCurrency(item.expectedMaterialCost, item.materialCostCurrency, language)}</p></div><div><p className="text-muted-foreground">{t("actual")}</p><p className="font-mono font-semibold">{formatCurrency(item.actualMaterialCost, item.materialCostCurrency, language)}</p></div><div><p className="text-muted-foreground">{t("variance")}</p><p className={`font-mono font-extrabold ${item.materialCostVariance === null ? "text-muted-foreground" : item.materialCostVariance >= 0 ? "text-emerald-700" : "text-destructive"}`}>{item.materialCostVariance === null ? "—" : formatCurrency(Math.abs(item.materialCostVariance), item.materialCostCurrency, language)}<span className="block text-[10px]">{item.materialCostVariance === null ? t("costUnavailable") : item.materialCostVariance >= 0 ? t("savings") : t("overrun")}</span></p></div></div></div>
    <div className="space-y-3">
      {canWork && ((isQueued && shift === 1) || canResume) && <Button size="sm" onClick={() => onAction(item, "start", { shift })} disabled={pendingId === item.serialNumberId} data-testid={`button-start-${item.serialNumberId}`}><Play size={14} className="mr-1"/>{isQueued ? t("start") : t("resume")} {shift}</Button>}
      {canWork && item.workStatus === "ongoing" && item.handoverToShift === null && <>
        <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold uppercase text-muted-foreground">{t("progress")} %<Input type="number" min="0" max="100" value={progressPct} onChange={e => setProgress(e.target.value)} data-testid={`input-progress-${item.serialNumberId}`}/></label>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("category")}<Select value={category} onValueChange={setCategory}><SelectTrigger data-testid={`select-category-${item.serialNumberId}`}><SelectValue/></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></label></div>
          <p className="text-xs text-muted-foreground">{t("usageBeforeTransition")} <Link href={`/paint-usage/new?jobItemId=${item.jobItemId}`} className="font-bold text-primary underline underline-offset-2">{t("recordPaintUsage")}</Link></p>
         <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pendingId === item.serialNumberId} onClick={() => onAction(item, "update_progress", { shift, progressPct: Number(progressPct), category, note: note || null })} data-testid={`button-update-${item.serialNumberId}`}><RefreshCw size={13} className="mr-1"/>{t("update")}</Button>
           {nextShift !== null && <Button size="sm" variant="outline" disabled={pendingId === item.serialNumberId} onClick={() => onAction(item, "handover", { shift, handoverToShift: nextShift, progressPct: Number(progressPct), category, note: note || null })} data-testid={`button-handover-${item.serialNumberId}`}><Send size={13} className="mr-1"/>{t("handover")} · Shift {nextShift}</Button>}
          {canComplete && <Button size="sm" onClick={() => onAction(item, "complete", { shift, progressPct: 100, category, note: note || null })} disabled={pendingId === item.serialNumberId} data-testid={`button-complete-${item.serialNumberId}`}><Check size={13} className="mr-1"/>{t("complete")}</Button>}</div>
        <Input value={note} onChange={e => setNote(e.target.value)} placeholder={t("note")} data-testid={`input-note-${item.serialNumberId}`}/>
      </>}
    </div>
  </article>;
}

export function Ongoing() {
  const { t } = useLanguage();
  const { user } = useAppAuth();
  const qc = useQueryClient();
  const query = useListJobWorkflow(undefined, { query: { queryKey: getListJobWorkflowQueryKey(), refetchInterval: 30000 } });
  const mutation = useUpdateJobWorkflow();
  const [shift, setShift] = useState("1");
  const [serverError, setError] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const rows = useMemo(() => (query.data ?? []).filter(x => x.workStatus === "ongoing" || x.workStatus === "queued"), [query.data]);
  const canWork = user?.role === "admin" || user?.role === "painter";
  async function act(item: JobWorkflowItem, action: string, extra?: Record<string, unknown>) {
    setError(""); setPendingId(item.serialNumberId);
    try {
      await mutation.mutateAsync({ id: item.serialNumberId, data: { action, ...(extra ?? {}) } as never });
      await Promise.all([qc.invalidateQueries({ queryKey: getListJobWorkflowQueryKey() }), qc.invalidateQueries({ queryKey: getListJobWorkflowHistoryQueryKey(item.serialNumberId) })]);
    } catch (e) { setError(e instanceof Error ? e.message : t("error")); }
    finally { setPendingId(null); }
  }
  return <div className="space-y-5 pb-10">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">IEG / {t("operations")}</p><h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">{t("ongoing")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("overview")}</p></div><label className="w-36 text-xs font-bold uppercase text-muted-foreground">{t("shift")}<Select value={shift} onValueChange={setShift}><SelectTrigger data-testid="select-current-shift"><SelectValue/></SelectTrigger><SelectContent>{[1,2,3].map(n=><SelectItem key={n} value={String(n)}>{t("shift")} {n}</SelectItem>)}</SelectContent></Select></label></header>
    {serverError && <div className="flex gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" data-testid="error-workflow-mutation"><AlertTriangle className="h-4 w-4 shrink-0"/><span>{t("conflict")} {serverError}</span></div>}
    <section className="border border-border bg-card"><div className="flex items-center justify-between border-b border-border bg-secondary/25 px-4 py-3"><div className="flex items-center gap-2"><ClipboardList size={17} className="text-primary"/><h2 className="text-xs font-extrabold uppercase tracking-widest">{t("ongoing")} · {rows.length}</h2></div><span className="text-xs text-muted-foreground">{t("queued")} + {t("active")}</span></div>
    {query.isLoading ? <div className="space-y-3 p-5"><div className="h-20 animate-pulse bg-muted"/><div className="h-20 animate-pulse bg-muted"/></div> : query.error ? <div className="p-10 text-center text-sm font-bold text-destructive">{t("error")}</div> : rows.length === 0 ? <div className="p-12 text-center text-sm text-muted-foreground">{t("noWorkflow")}</div> : rows.map(item=><WorkflowRow key={item.serialNumberId} item={item} shift={Number(shift)} canWork={canWork} canComplete={user?.role === "painter"} pendingId={pendingId} onAction={act}/>)}
    </section>
  </div>;
}
