import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  getListMaterialsQueryKey,
  getListStockMovementsQueryKey,
  getListStockTakesQueryKey,
  useListMaterials,
  useListStockMovements,
  useListStockTakes,
} from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";

type Period = "week" | "month";

function datePart(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function periodRange(period: Period, offset: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let end: Date;
  if (period === "week") {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday + offset * 7);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else {
    start.setDate(1);
    start.setMonth(start.getMonth() + offset);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  }
  return {
    from: datePart(start),
    to: datePart(end),
    fromTime: new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime(),
    toTime: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime(),
  };
}

function signedQuantity(movement: { movementType: string; quantityL: number }) {
  return movement.movementType === "out" ? -Math.abs(movement.quantityL) : Math.abs(movement.quantityL);
}

export function StockReports() {
  const { language, t } = useLanguage();
  const [period, setPeriod] = useState<Period>("week");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [exportError, setExportError] = useState("");
  const range = useMemo(() => periodRange(period, periodOffset), [period, periodOffset]);
  const locale = language === "id" ? "id-ID" : "en-US";
  const formatLiters = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const formatDate = (value: Date | string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const formatDateTime = (value: Date | string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const periodLabel = `${range.from} – ${range.to}`;

  const materialQuery = useListMaterials({
    query: { queryKey: getListMaterialsQueryKey() },
  });
  const movementQuery = useListStockMovements({
    query: { queryKey: getListStockMovementsQueryKey() },
  });
  const stockTakeQuery = useListStockTakes({
    query: { queryKey: getListStockTakesQueryKey() },
  });

  const materials = materialQuery.data ?? [];
  const movements = movementQuery.data ?? [];
  const stockTakes = stockTakeQuery.data ?? [];
  const periodMovements = useMemo(
    () => movements.filter((movement) => {
      const time = new Date(movement.createdAt).getTime();
      return time >= range.fromTime && time <= range.toTime;
    }),
    [movements, range.fromTime, range.toTime],
  );
  const materialSummary = useMemo(() => {
    const byMaterial = new Map<number, typeof movements>();
    for (const movement of movements) {
      const current = byMaterial.get(movement.materialId) ?? [];
      current.push(movement);
      byMaterial.set(movement.materialId, current);
    }

    return materials.map((material) => {
      const history = byMaterial.get(material.id) ?? [];
      const inPeriod = history.filter((movement) => {
        const time = new Date(movement.createdAt).getTime();
        return time >= range.fromTime && time <= range.toTime;
      });
      const throughEnd = history.filter((movement) => new Date(movement.createdAt).getTime() <= range.toTime);
      const beforePeriod = history.filter((movement) => new Date(movement.createdAt).getTime() < range.fromTime);
      const openingL = beforePeriod.reduce((sum, movement) => sum + signedQuantity(movement), 0);
      const receivedL = inPeriod.filter((movement) => movement.movementType === "in")
        .reduce((sum, movement) => sum + Math.abs(movement.quantityL), 0);
      const issuedL = inPeriod.filter((movement) => movement.movementType === "out")
        .reduce((sum, movement) => sum + Math.abs(movement.quantityL), 0);
      const returnedL = inPeriod.filter((movement) => movement.movementType === "return_to_stock")
        .reduce((sum, movement) => sum + Math.abs(movement.quantityL), 0);
      const closingL = throughEnd.reduce((sum, movement) => sum + signedQuantity(movement), 0);
      const lastIssue = history
        .filter((movement) => movement.movementType === "out" && new Date(movement.createdAt).getTime() <= range.toTime)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return {
        ...material,
        openingL,
        receivedL,
        issuedL,
        returnedL,
        closingL,
        netL: receivedL + returnedL - issuedL,
        lastIssueAt: lastIssue?.createdAt ?? null,
        transactionCount: inPeriod.length,
        isBelowMinimum: material.deadStockThreshold > 0 && closingL <= material.deadStockThreshold,
        hasNoIssue: closingL > 0 && issuedL === 0,
      };
    }).sort((a, b) => a.description.localeCompare(b.description));
  }, [materials, movements, range.fromTime, range.toTime]);

  const stockTakesInPeriod = stockTakes.filter((take) => {
    const time = new Date(take.createdAt).getTime();
    return time >= range.fromTime && time <= range.toTime;
  });
  const totalReceivedL = materialSummary.reduce((sum, row) => sum + row.receivedL, 0);
  const totalIssuedL = materialSummary.reduce((sum, row) => sum + row.issuedL, 0);
  const totalReturnedL = materialSummary.reduce((sum, row) => sum + row.returnedL, 0);
  const totalClosingL = materialSummary.reduce((sum, row) => sum + row.closingL, 0);
  const lowStockCount = materialSummary.filter((row) => row.isBelowMinimum).length;
  const fastMoving = materialSummary.filter((row) => row.issuedL > 0).sort((a, b) => b.issuedL - a.issuedL).slice(0, 10);
  const noIssueItems = materialSummary.filter((row) => row.hasNoIssue).sort((a, b) => b.closingL - a.closingL);
  const isLoading = materialQuery.isLoading || movementQuery.isLoading || stockTakeQuery.isLoading;
  const hasError = materialQuery.isError || movementQuery.isError || stockTakeQuery.isError;

  async function downloadExcel() {
    setExportError("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const summary = [
        [t("stockReportTitle")],
        [t("reportPeriod"), period === "week" ? t("weekly") : t("monthly")],
        [t("reportDate"), periodLabel],
        [t("stockTakeInPeriod"), stockTakesInPeriod.length],
        [t("stockReceived"), totalReceivedL],
        [t("stockIssued"), totalIssuedL],
        [t("stockReturned"), totalReturnedL],
        [t("stockClosing"), totalClosingL],
        [t("stockBelowMinimum"), lowStockCount],
      ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "Summary");

      const stockRows = materialSummary.map((row) => ({
        [t("stockReportMaterial")]: row.description,
        [t("brand")]: row.brandName,
        [t("stockOpening")]: row.openingL,
        [t("stockReceived")]: row.receivedL,
        [t("stockIssued")]: row.issuedL,
        [t("stockReturned")]: row.returnedL,
        [t("stockNet")]: row.netL,
        [t("stockClosing")]: row.closingL,
        [t("stockMinLevel")]: row.deadStockThreshold,
        [t("stockLastIssue")]: row.lastIssueAt ? formatDateTime(row.lastIssueAt) : "",
        [t("stockMovementCount")]: row.transactionCount,
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stockRows), "By Material");

      const transactionRows = periodMovements.map((movement) => ({
        [t("reportDate")]: formatDateTime(movement.createdAt),
        [t("stockReportMaterial")]: movement.materialDescription,
        [t("brand")]: movement.brandName,
        [t("lot")]: movement.lotNo ?? "",
        [t("expiry")]: movement.expiryDate ? formatDate(movement.expiryDate) : "",
        [t("transactionType")]: t(movement.movementType === "in" ? "receipt" : movement.movementType === "out" ? "issue" : "stockReturn"),
        [t("quantityL")]: signedQuantity(movement),
        [t("createdBy")]: movement.createdByName ?? "",
        [t("reportNotes")]: movement.notes ?? "",
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionRows), "Transactions");

      const movementAnalysis = [
        [t("stockFastMoving")],
        [t("stockReportMaterial"), t("brand"), t("stockIssued"), t("stockClosing"), t("stockLastIssue")],
        ...fastMoving.map((row) => [row.description, row.brandName, row.issuedL, row.closingL, row.lastIssueAt ? formatDate(row.lastIssueAt) : ""]),
        [],
        [t("stockPotentialDead")],
        [t("stockReportMaterial"), t("brand"), t("stockClosing"), t("stockLastIssue")],
        ...noIssueItems.map((row) => [row.description, row.brandName, row.closingL, row.lastIssueAt ? formatDate(row.lastIssueAt) : ""]),
      ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(movementAnalysis), "Movement Analysis");
      XLSX.writeFile(workbook, `paintshop-stock-${period}-${range.from}-${range.to}.xlsx`);
    } catch {
      setExportError(t("reportExportError"));
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          #stock-report-print, #stock-report-print * { visibility: visible !important; }
          #stock-report-print { position: fixed !important; inset: 0 !important; width: 100% !important; overflow: visible !important; background: white !important; color: black !important; }
          .stock-report-no-print { display: none !important; }
          .stock-report-table { border-collapse: collapse !important; width: 100% !important; }
          .stock-report-table th, .stock-report-table td { border: 1px solid #999 !important; color: #111 !important; padding: 4px !important; font-size: 9px !important; }
        }
      `}</style>
      <header className="stock-report-no-print flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{t("stockReports")}</p>
          <h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">{t("stockReportTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("stockReportDescription")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={isLoading || hasError}><Printer size={15} className="mr-2"/>{t("reportPdf")}</Button>
          <Button onClick={() => void downloadExcel()} disabled={isLoading || hasError}><FileSpreadsheet size={15} className="mr-2"/>{t("reportExcel")}<Download size={14} className="ml-2"/></Button>
        </div>
      </header>

      <section className="stock-report-no-print flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={period === "week" ? "default" : "outline"} onClick={() => { setPeriod("week"); setPeriodOffset(0); }}>{t("weekly")}</Button>
          <Button size="sm" variant={period === "month" ? "default" : "outline"} onClick={() => { setPeriod("month"); setPeriodOffset(0); }}>{t("monthly")}</Button>
          <div className="ml-1 flex items-center gap-1">
            <Button size="icon" variant="outline" aria-label={t("previousPeriod")} onClick={() => setPeriodOffset((value) => value - 1)}><ChevronLeft size={16}/></Button>
            <span className="min-w-44 text-center text-sm font-semibold">{periodLabel}</span>
            <Button size="icon" variant="outline" aria-label={t("nextPeriod")} onClick={() => setPeriodOffset((value) => Math.min(0, value + 1))} disabled={periodOffset === 0}><ChevronRight size={16}/></Button>
          </div>
        </div>
        <Link href="/stock" className="text-sm font-bold text-primary underline underline-offset-2">{t("stockGoToStock")}</Link>
      </section>

      {exportError && <p className="stock-report-no-print border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">{exportError}</p>}
      {isLoading && <p className="border border-border bg-card p-5 text-sm text-muted-foreground">{t("stockReportLoading")}</p>}
      {hasError && <p className="border border-destructive/30 bg-destructive/10 p-5 text-sm font-semibold text-destructive">{t("stockReportError")}</p>}

      {!isLoading && !hasError && (
        <div id="stock-report-print" className="space-y-5">
          <header className="hidden print:block">
            <h1 className="text-xl font-bold">{t("stockReportTitle")}</h1>
            <p>{period === "week" ? t("weekly") : t("monthly")} · {periodLabel}</p>
          </header>

          {materials.length === 0 && movements.length === 0 ? (
            <p className="border border-border bg-card p-6 text-center text-sm text-muted-foreground">{t("stockReportNoData")}</p>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  [t("stockReportMaterial"), materials.length],
                  [t("stockReceived"), `${formatLiters(totalReceivedL)} L`],
                  [t("stockIssued"), `${formatLiters(totalIssuedL)} L`],
                  [t("stockClosing"), `${formatLiters(totalClosingL)} L`],
                  [t("stockBelowMinimum"), lowStockCount],
                ].map(([label, value]) => (
                  <div key={String(label)} className="border border-border bg-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                    <p className="mt-2 font-mono text-2xl font-extrabold">{value}</p>
                  </div>
                ))}
              </section>

              <section className={`stock-report-no-print border p-4 ${stockTakesInPeriod.length === 0 ? "border-amber-700/30 bg-amber-50 text-amber-950" : "border-emerald-700/30 bg-emerald-50 text-emerald-950"}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest">{t("stockTakeInPeriod")}: {stockTakesInPeriod.length}</p>
                {stockTakesInPeriod.length === 0
                  ? <p className="mt-1 text-sm">{t("stockTakeMissing")} <Link href="/stock" className="font-bold underline">{t("stockGoToStock")}</Link></p>
                  : <p className="mt-1 text-sm">{stockTakesInPeriod.length} · {periodLabel}</p>}
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-extrabold uppercase tracking-widest">{t("stockReportMaterial")} / {periodLabel}</h2>
                <div className="overflow-x-auto border border-border bg-card">
                  <table className="stock-report-table w-full min-w-[1050px] text-left text-xs">
                    <thead className="bg-secondary/70 text-[10px] uppercase tracking-wide"><tr>
                      <th className="p-2">{t("stockReportMaterial")}</th><th className="p-2">{t("brand")}</th><th className="p-2 text-right">{t("stockOpening")} (L)</th><th className="p-2 text-right">{t("stockReceived")} (L)</th><th className="p-2 text-right">{t("stockIssued")} (L)</th><th className="p-2 text-right">{t("stockReturned")} (L)</th><th className="p-2 text-right">{t("stockNet")} (L)</th><th className="p-2 text-right">{t("stockClosing")} (L)</th><th className="p-2 text-right">{t("stockMinLevel")} (L)</th><th className="p-2">{t("stockLastIssue")}</th>
                    </tr></thead>
                    <tbody>{materialSummary.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="p-2 font-semibold">{row.description}</td><td className="p-2">{row.brandName}</td><td className="p-2 text-right font-mono">{formatLiters(row.openingL)}</td><td className="p-2 text-right font-mono">{formatLiters(row.receivedL)}</td><td className="p-2 text-right font-mono">{formatLiters(row.issuedL)}</td><td className="p-2 text-right font-mono">{formatLiters(row.returnedL)}</td><td className="p-2 text-right font-mono">{formatLiters(row.netL)}</td><td className="p-2 text-right font-mono font-bold">{formatLiters(row.closingL)}</td><td className="p-2 text-right font-mono">{formatLiters(row.deadStockThreshold)}</td><td className="p-2">{row.lastIssueAt ? formatDate(row.lastIssueAt) : "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <h2 className="text-xs font-extrabold uppercase tracking-widest">{t("stockFastMoving")}</h2>
                  {fastMoving.length === 0 ? <p className="border border-border bg-card p-4 text-sm text-muted-foreground">—</p> : (
                    <div className="overflow-x-auto border border-border bg-card">
                      <table className="stock-report-table w-full text-left text-xs"><thead className="bg-secondary/70 text-[10px] uppercase tracking-wide"><tr><th className="p-2">{t("stockReportMaterial")}</th><th className="p-2">{t("brand")}</th><th className="p-2 text-right">{t("stockIssued")} (L)</th></tr></thead>
                        <tbody>{fastMoving.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-2">{row.description}</td><td className="p-2">{row.brandName}</td><td className="p-2 text-right font-mono font-bold">{formatLiters(row.issuedL)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <h2 className="text-xs font-extrabold uppercase tracking-widest">{t("stockPotentialDead")}</h2>
                  <p className="text-[10px] text-muted-foreground">{t("stockNoMovement")}</p>
                  {noIssueItems.length === 0 ? <p className="border border-border bg-card p-4 text-sm text-muted-foreground">—</p> : (
                    <div className="overflow-x-auto border border-border bg-card">
                      <table className="stock-report-table w-full text-left text-xs"><thead className="bg-secondary/70 text-[10px] uppercase tracking-wide"><tr><th className="p-2">{t("stockReportMaterial")}</th><th className="p-2">{t("brand")}</th><th className="p-2 text-right">{t("stockClosing")} (L)</th><th className="p-2">{t("stockLastIssue")}</th></tr></thead>
                        <tbody>{noIssueItems.map((row) => <tr key={row.id} className="border-t border-border"><td className="p-2">{row.description}</td><td className="p-2">{row.brandName}</td><td className="p-2 text-right font-mono font-bold">{formatLiters(row.closingL)}</td><td className="p-2">{row.lastIssueAt ? formatDate(row.lastIssueAt) : "—"}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-extrabold uppercase tracking-widest">{t("stockTransactions")}</h2>
                {periodMovements.length === 0 ? <p className="border border-border bg-card p-4 text-sm text-muted-foreground">—</p> : (
                  <div className="overflow-x-auto border border-border bg-card">
                    <table className="stock-report-table w-full min-w-[1000px] text-left text-xs"><thead className="bg-secondary/70 text-[10px] uppercase tracking-wide"><tr><th className="p-2">{t("reportDate")}</th><th className="p-2">{t("stockReportMaterial")}</th><th className="p-2">{t("brand")}</th><th className="p-2">{t("lot")}</th><th className="p-2">{t("transactionType")}</th><th className="p-2 text-right">{t("quantityL")}</th><th className="p-2">{t("createdBy")}</th><th className="p-2">{t("reportNotes")}</th></tr></thead>
                      <tbody>{periodMovements.map((movement) => <tr key={movement.id} className="border-t border-border"><td className="whitespace-nowrap p-2">{formatDateTime(movement.createdAt)}</td><td className="p-2">{movement.materialDescription}</td><td className="p-2">{movement.brandName}</td><td className="p-2 font-mono">{movement.lotNo ?? "—"}</td><td className="p-2">{t(movement.movementType === "in" ? "receipt" : movement.movementType === "out" ? "issue" : "stockReturn")}</td><td className="p-2 text-right font-mono">{movement.movementType === "out" ? "-" : "+"}{formatLiters(Math.abs(movement.quantityL))}</td><td className="p-2">{movement.createdByName ?? "—"}</td><td className="p-2">{movement.notes ?? "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
