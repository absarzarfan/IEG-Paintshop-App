import { Fragment, useMemo, useState } from "react";
import {
  getListJobItemsQueryKey,
  getListJobWorkflowQueryKey,
  getListPaintUsageQueryKey,
  getListMaterialsQueryKey,
  useListJobItems,
  useListJobWorkflow,
  useListPaintUsage,
  useListMaterials,
} from "@workspace/api-client-react";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Printer, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { buildMixingRows, type MixingRow } from "./mixing-record";

type StatusFilter = "all" | "exceeded" | "ontrack";
type Component = MixingRow["components"][number];

const TEXT = {
  id: {
    title: "Catatan Pencampuran Cat", sub: "Kumulatif semua shift, sepanjang waktu. Bandingkan aktual dengan target per komponen Primer dan Topcoat.",
    search: "Cari JN / SN / pelanggan / deskripsi", all: "Semua", exceeded: "Melebihi", ontrack: "Sesuai jalur",
    excel: "Excel", print: "Cetak / PDF", loading: "Memuat catatan pencampuran", error: "Gagal memuat data pencampuran.", retry: "Coba lagi",
    empty: "Tidak ada catatan yang cocok dengan filter.", noData: "Belum ada pekerjaan atau pemakaian cat tercatat.",
    jn: "JN", sn: "SN", customer: "Pelanggan", desc: "Deskripsi", qty: "Qty Order", reg: "SN Terdaftar", progress: "Progres",
    primer: "Primer", topcoat: "Topcoat", base: "Base", hardener: "Hardener", thinner: "Thinner",
    actual: "Aktual", target: "Target", delta: "Selisih", dates: "Tanggal", pic: "PIC",
    expected: "Jatah sesuai progres", progVar: "Varians progres", total: "Total", remaining: "Sisa anggaran",
    statusCol: "Status", statusExceeded: "MELEBIHI JATAH PROGRES", statusOk: "SESUAI JALUR", planOver: "Anggaran order terlampaui", missing: "Data job tidak ditemukan",
    addOns: "Tahap tambahan", none: "Tidak ada tahap tambahan", details: "Rincian",
    rows: "Catatan", exceededCount: "Melebihi jatah", planCount: "Anggaran terlampaui", totalActual: "Total aktual",
    legend: "Selisih = target - aktual (anggaran order penuh). Merah = sudah melebihi target. Status pekerjaan aktif memakai varians progres (jatah sesuai progres - aktual), bukan sisa anggaran; sisa positif belum berarti hemat selama pekerjaan belum selesai.",
    color: "Warna resep saat ini",
    colorNote: "Warna mengacu pada material Base Topcoat pada resep JN saat ini, bukan snapshot warna historis tiap pemakaian.",
    exportError: "Ekspor Excel gagal. Coba lagi.", polling: "Diperbarui otomatis tiap 30 detik",
  },
  en: {
    title: "Paint Mixing Record", sub: "Cumulative across all shifts, all time. Actual versus target per Primer and Topcoat component.",
    search: "Search JN / SN / customer / description", all: "All", exceeded: "Exceeded", ontrack: "On track",
    excel: "Excel", print: "Print / PDF", loading: "Loading mixing records", error: "Could not load mixing data.", retry: "Retry",
    empty: "No records match the current filters.", noData: "No jobs or paint usage recorded yet.",
    jn: "JN", sn: "SN", customer: "Customer", desc: "Description", qty: "Order Qty", reg: "Registered SN", progress: "Progress",
    primer: "Primer", topcoat: "Topcoat", base: "Base", hardener: "Hardener", thinner: "Thinner",
    actual: "Actual", target: "Target", delta: "Delta", dates: "Dates", pic: "PIC",
    expected: "Progress allowance", progVar: "Progress variance", total: "Total", remaining: "Budget remaining",
    statusCol: "Status", statusExceeded: "EXCEEDED PROGRESS ALLOWANCE", statusOk: "ON TRACK", planOver: "Order budget exceeded", missing: "Job record missing",
    addOns: "Add-on stages", none: "No add-on stages", details: "Details",
    rows: "Records", exceededCount: "Over allowance", planCount: "Budget exceeded", totalActual: "Total actual",
    legend: "Delta = target - actual (full order budget). Red = already over target. Active job status uses progress variance (progress allowance - actual), not budget remaining; a positive remainder is not a saving while work is incomplete.",
    color: "Current recipe color",
    colorNote: "Color comes from the current JN Topcoat Base material, not a historical color snapshot for each usage.",
    exportError: "Excel export failed. Please retry.", polling: "Auto-refreshes every 30 seconds",
  },
};

const NAMES = ["base", "hardener", "thinner"] as const;
const COATS = ["primer", "topcoat"] as const;

export function MixingRecordView() {
  const { language } = useLanguage();
  const L = language === "en" ? TEXT.en : TEXT.id;
  const locale = language === "en" ? "en-US" : "id-ID";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [exportError, setExportError] = useState("");

  const jobsQ = useListJobItems(undefined, { query: { queryKey: getListJobItemsQueryKey(), refetchInterval: 30000 } });
  const usageQ = useListPaintUsage(undefined, { query: { queryKey: getListPaintUsageQueryKey(), refetchInterval: 30000 } });
  const wfQ = useListJobWorkflow(undefined, { query: { queryKey: getListJobWorkflowQueryKey(), refetchInterval: 30000 } });
  const materialsQ = useListMaterials({ query: { queryKey: getListMaterialsQueryKey(), refetchInterval: 30000 } });
  const recipeColors = useMemo(() => {
    const materials = new Map((materialsQ.data ?? []).map((material) => [material.id, material]));
    return new Map((jobsQ.data ?? []).map((job) => [
      job.id, materials.get(job.topcoatBaseMaterialId ?? -1)?.color ?? "—",
    ]));
  }, [jobsQ.data, materialsQ.data]);

  const rows = useMemo(
    () => (jobsQ.data && usageQ.data && wfQ.data ? buildMixingRows(jobsQ.data, usageQ.data, wfQ.data) : []),
    [jobsQ.data, usageQ.data, wfQ.data],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "exceeded" && (r.missingJob || !r.exceeded)) return false;
      if (status === "ontrack" && (r.missingJob || r.exceeded)) return false;
      if (!q) return true;
      return [r.jobNo, r.customerName, r.description, ...r.serials].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, search, status]);

  const fmt = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(v);
  const signed = (v: number) => `${v > 0 ? "+" : ""}${fmt(v)}`;
  const tone = (v: number) => (v < 0 ? "text-destructive" : "text-emerald-700");
  const fmtDate = (v: string) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }).format(d);
  };
  const comp = (r: MixingRow, coat: string, name: string): Component | undefined =>
    r.components.find((c) => c.coat === coat && c.name === name);
  const statusText = (r: MixingRow) =>
    r.missingJob ? L.missing : [r.exceeded ? L.statusExceeded : L.statusOk, r.planExceeded ? L.planOver : ""].filter(Boolean).join(" · ");

  const isLoading = jobsQ.isLoading || usageQ.isLoading || wfQ.isLoading || materialsQ.isLoading;
  const isError = jobsQ.isError || usageQ.isError || wfQ.isError || materialsQ.isError;
  const retry = () => { void jobsQ.refetch(); void usageQ.refetch(); void wfQ.refetch(); void materialsQ.refetch(); };

  const toggle = (id: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function exportExcel() {
    setExportError("");
    try {
      const XLSX = await import("xlsx");
      const data = filtered.map((r) => {
        const out: Record<string, string | number> = {
          [L.jn]: r.jobNo, [L.sn]: r.serials.join(", "), [L.customer]: r.customerName, [L.desc]: r.description,
          [L.qty]: r.quantity, [L.reg]: r.registeredQuantity, [`${L.progress} (%)`]: r.progressPct,
          [`${L.primer} ${L.dates}`]: r.primerDates.map(fmtDate).join(", "),
          [`${L.topcoat} ${L.dates}`]: r.topcoatDates.map(fmtDate).join(", "),
          [L.pic]: r.operators.join(", "),
          [L.color]: recipeColors.get(r.jobItemId) ?? "—",
        };
        for (const coat of COATS) for (const name of NAMES) {
          const c = comp(r, coat, name);
          const p = `${coat === "primer" ? L.primer : L.topcoat} ${L[name]}`;
          out[`${p} ${L.actual} (L)`] = c?.actual ?? 0;
          out[`${p} ${L.target} (L)`] = c?.target ?? 0;
          out[`${p} ${L.delta} (L)`] = c?.remaining ?? 0;
          out[`${p} ${L.expected} (L)`] = c?.expected ?? 0;
          out[`${p} ${L.progVar} (L)`] = c?.progressVariance ?? 0;
        }
        out[L.addOns] = r.addOns.map((a) => `${a.name}: ${a.actual}/${a.target} L (${L.delta} ${a.remaining})`).join("; ");
        out[`${L.total} ${L.actual} (L)`] = r.totalActual;
        out[`${L.total} ${L.target} (L)`] = r.totalTarget;
        out[`${L.remaining} (L)`] = r.totalRemaining;
        out[`${L.expected} (L)`] = r.expectedTotal;
        out[`${L.progVar} (L)`] = r.progressVariance;
        out[L.statusCol] = statusText(r);
        return out;
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Mixing Record");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[L.title], [L.sub], [L.legend], [L.colorNote]]), "Notes");
      XLSX.writeFile(wb, `paintshop-mixing-record-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      setExportError(L.exportError);
    }
  }

  const exceededCount = filtered.filter((r) => !r.missingJob && r.exceeded).length;
  const planCount = filtered.filter((r) => !r.missingJob && r.planExceeded).length;
  const totalActual = filtered.reduce((s, r) => s + r.totalActual, 0);
  const th = "border-l border-border p-1.5 text-center";
  const td = "border-l border-border p-1.5 text-right font-mono tabular-nums";

  return (
    <div className="space-y-4">
      <style>{`@media print {
        @page { size: A3 landscape; margin: 8mm; }
        #paintshop-report-print { position: absolute !important; }
        #paintshop-report-print .overflow-x-auto { overflow: visible !important; }
        #paintshop-report-print table { min-width: 0 !important; }
        #paintshop-report-print .report-print-table th,
        #paintshop-report-print .report-print-table td { font-size: 7px !important; padding: 2px !important; }
      }`}</style>
      <section className="report-no-print flex flex-col gap-3 border border-border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <label className="relative min-w-64 flex-1 lg:max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L.search} aria-label={L.search}
              className="h-10 w-full border border-input bg-background pl-9 pr-3 text-sm" data-testid="input-mixing-search" />
          </label>
          <div className="flex border border-border">
            {(["all", "exceeded", "ontrack"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s} data-testid={`button-mixing-filter-${s}`}
                className={`h-10 px-3 text-xs font-bold uppercase tracking-wide transition-colors ${status === s ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary"}`}>
                {L[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={isLoading || isError} data-testid="button-mixing-print"><Printer size={15} className="mr-2" />{L.print}</Button>
          <Button onClick={() => void exportExcel()} disabled={isLoading || isError || filtered.length === 0} data-testid="button-mixing-excel"><FileSpreadsheet size={15} className="mr-2" />{L.excel}<Download size={14} className="ml-2" /></Button>
        </div>
      </section>

      {exportError && <p role="alert" className="report-no-print border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive">{exportError}</p>}

      {isLoading ? (
        <div className="space-y-2" aria-label={L.loading}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 animate-pulse border border-border bg-secondary/60" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-destructive/30 bg-destructive/10 p-5 text-sm font-semibold text-destructive">
          {L.error}
          <Button variant="outline" size="sm" onClick={retry} data-testid="button-mixing-retry"><RefreshCw size={14} className="mr-2" />{L.retry}</Button>
        </div>
      ) : (
        <div id="paintshop-report-print" className="space-y-4">
          <header>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">IEG Paintshop · ALL SHIFTS · ALL TIME</p>
            <h2 className="text-xl font-extrabold uppercase tracking-tight">{L.title}</h2>
            <p className="text-xs text-muted-foreground">{L.sub} <span className="report-no-print">{L.polling}.</span></p>
          </header>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[[L.rows, `${filtered.length} / ${rows.length}`], [L.exceededCount, exceededCount], [L.planCount, planCount], [L.totalActual, `${fmt(totalActual)} L`]].map(([k, v], i) => (
              <div key={String(k)} className={`report-print-card border bg-card p-4 ${i === 1 && exceededCount > 0 ? "border-destructive/40" : "border-border"}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{k}</p>
                <p className={`mt-2 font-mono text-2xl font-extrabold ${i === 1 && exceededCount > 0 ? "text-destructive" : ""}`} data-testid={`text-mixing-kpi-${i}`}>{v}</p>
              </div>
            ))}
          </section>

          {rows.length === 0 || filtered.length === 0 ? (
            <div className="border border-dashed border-border bg-card p-10 text-center">
              <p className="text-sm font-semibold">{rows.length === 0 ? L.noData : L.empty}</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border bg-card">
              <table className="report-print-table w-full min-w-[1700px] border-collapse text-[11px]">
                <thead className="text-[10px] uppercase tracking-wide">
                  <tr className="bg-secondary/80">
                    <th rowSpan={3} className="p-1.5" />
                    <th rowSpan={3} className="p-1.5 text-left">{L.jn} / {L.sn}</th>
                    <th rowSpan={3} className="border-l border-border p-1.5 text-left">{L.customer} / {L.desc}</th>
                    <th rowSpan={3} className={th}>{L.qty}</th>
                    <th rowSpan={3} className={th}>{L.progress}</th>
                    {COATS.map((coat) => (
                      <th key={coat} colSpan={10} className={`${th} ${coat === "primer" ? "bg-amber-100/70 text-amber-950" : "bg-sky-100/70 text-sky-950"}`}>{coat === "primer" ? L.primer : L.topcoat}</th>
                    ))}
                    <th colSpan={5} className={`${th} bg-secondary`}>{L.total}</th>
                    <th rowSpan={3} className={th}>{L.statusCol}</th>
                  </tr>
                  <tr className="bg-secondary/50">
                    {COATS.map((coat) => (
                      <Fragment key={coat}>
                        <th rowSpan={2} className={th}>{L.dates}</th>
                        {NAMES.map((n) => <th key={n} colSpan={3} className={th}>{L[n]}</th>)}
                      </Fragment>
                    ))}
                    <th rowSpan={2} className={th}>{L.actual}</th>
                    <th rowSpan={2} className={th}>{L.target}</th>
                    <th rowSpan={2} className={th}>{L.remaining}</th>
                    <th rowSpan={2} className={th}>{L.expected}</th>
                    <th rowSpan={2} className={th}>{L.progVar}</th>
                  </tr>
                  <tr className="bg-secondary/30 text-[9px]">
                    {COATS.map((coat) => NAMES.map((n) => (
                      <Fragment key={`${coat}-${n}`}><th className={th}>{L.actual}</th><th className={th}>{L.target}</th><th className={th}>{L.delta}</th></Fragment>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isOpen = open.has(r.jobItemId);
                    return (
                      <Fragment key={r.jobItemId}>
                        <tr className={`border-t border-border align-top ${r.exceeded ? "bg-destructive/[.04]" : ""}`} data-testid={`row-mixing-${r.jobItemId}`}>
                          <td className="p-1.5">
                             <button type="button" onClick={() => toggle(r.jobItemId)} aria-label={`${L.details} ${r.jobNo}`} aria-expanded={isOpen} className="report-no-print p-0.5 hover:bg-secondary" data-testid={`button-mixing-expand-${r.jobItemId}`}>
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </td>
                          <td className="p-1.5">
                            <p className="font-mono font-bold">{r.jobNo}</p>
                            <p className="max-w-40 font-mono text-[10px] text-muted-foreground">{r.serials.length ? r.serials.join(", ") : "—"}</p>
                          </td>
                          <td className="max-w-56 border-l border-border p-1.5">
                            <p className="font-semibold">{r.customerName || "—"}</p>
                            <p className="text-[10px] text-muted-foreground">{r.description}</p>
                             <p className="mt-1 text-[10px]">{L.color}: {recipeColors.get(r.jobItemId) ?? "—"}</p>
                          </td>
                          <td className={td}>{r.quantity}<span className="block text-[9px] text-muted-foreground">{r.registeredQuantity} SN</span></td>
                          <td className={td}>{fmt(r.progressPct)}%</td>
                          {COATS.map((coat) => (
                            <Fragment key={coat}>
                              <td className="border-l border-border p-1.5 text-[10px] whitespace-nowrap">
                                {(coat === "primer" ? r.primerDates : r.topcoatDates).slice(0, 3).map(fmtDate).join(", ") || "—"}
                                {(coat === "primer" ? r.primerDates : r.topcoatDates).length > 3 && <span className="text-muted-foreground"> +{(coat === "primer" ? r.primerDates : r.topcoatDates).length - 3}</span>}
                              </td>
                              {NAMES.map((n) => {
                                const c = comp(r, coat, n);
                                return (
                                  <Fragment key={n}>
                                    <td className={td}>{fmt(c?.actual ?? 0)}</td>
                                    <td className={`${td} text-muted-foreground`}>{fmt(c?.target ?? 0)}</td>
                                     <td className={`${td} font-bold ${(c?.remaining ?? 0) < 0 ? "bg-destructive/10" : "bg-emerald-100/50"} ${tone(c?.remaining ?? 0)}`}>{signed(c?.remaining ?? 0)}</td>
                                  </Fragment>
                                );
                              })}
                            </Fragment>
                          ))}
                          <td className={`${td} font-bold`}>{fmt(r.totalActual)}</td>
                          <td className={`${td} text-muted-foreground`}>{fmt(r.totalTarget)}</td>
                          <td className={`${td} ${tone(r.totalRemaining)}`}>{signed(r.totalRemaining)}</td>
                          <td className={td}>{fmt(r.expectedTotal)}</td>
                          <td className={`${td} font-bold ${tone(r.progressVariance)}`}>{signed(r.progressVariance)}</td>
                          <td className="border-l border-border p-1.5">
                            <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide ${r.exceeded ? "bg-destructive text-destructive-foreground" : "bg-emerald-700/10 text-emerald-800"}`} data-testid={`status-mixing-${r.jobItemId}`}>
                              {r.missingJob ? L.missing : r.exceeded ? L.statusExceeded : L.statusOk}
                            </span>
                            {r.planExceeded && <p className="mt-1 text-[9px] font-bold text-destructive">{L.planOver}</p>}
                            {r.missingJob && <p className="mt-1 text-[9px] font-bold text-amber-700">{L.missing}</p>}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-dashed border-border bg-secondary/20">
                            <td />
                            <td colSpan={31} className="p-3">
                              <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{L.pic}</p>
                                  <p className="mt-1">{r.operators.join(", ") || "—"}</p>
                                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{L.primer} / {L.topcoat} {L.dates}</p>
                                  <p className="mt-1 font-mono text-[10px]">{r.primerDates.map(fmtDate).join(", ") || "—"}</p>
                                  <p className="font-mono text-[10px]">{r.topcoatDates.map(fmtDate).join(", ") || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{L.expected} / {L.progVar} (L)</p>
                                  <table className="mt-1 w-full text-[10px]">
                                    <tbody>
                                      {r.components.map((c) => (
                                        <tr key={c.key} className="border-t border-border/60">
                                          <td className="py-0.5">{c.coat === "primer" ? L.primer : L.topcoat} {L[c.name]}</td>
                                          <td className="text-right font-mono">{fmt(c.expected)}</td>
                                          <td className={`text-right font-mono font-bold ${tone(c.progressVariance)}`}>{signed(c.progressVariance)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{L.addOns}</p>
                                  {r.addOns.length === 0 ? <p className="mt-1 text-muted-foreground">{L.none}</p> : (
                                    <table className="mt-1 w-full text-[10px]">
                                      <tbody>
                                        {r.addOns.map((a) => (
                                          <tr key={a.name} className="border-t border-border/60">
                                            <td className="py-0.5">{a.name}</td>
                                            <td className="text-right font-mono">{fmt(a.actual)} / {fmt(a.target)}</td>
                                            <td className={`text-right font-mono font-bold ${tone(a.remaining)}`}>{signed(a.remaining)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                  <p className="mt-2 text-[10px] italic text-muted-foreground">{L.colorNote}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">{L.legend}</p>
          <p className="text-[10px] text-muted-foreground">{L.colorNote}</p>
        </div>
      )}
    </div>
  );
}
