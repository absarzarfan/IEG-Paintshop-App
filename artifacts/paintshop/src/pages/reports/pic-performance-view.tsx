import type { PicPerformanceRow } from "./pic-performance";

interface PicPerformanceViewProps {
  rows: PicPerformanceRow[];
  historyError: boolean;
  t: (key: string) => string;
  formatLiters: (value: number) => string;
}

export function PicPerformanceView({
  rows,
  historyError,
  t,
  formatLiters,
}: PicPerformanceViewProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-extrabold uppercase tracking-widest">{t("reportPicPerformance")}</h2>
      <p className="text-[10px] text-muted-foreground">{t("reportPicAllocationNote")}</p>
      {historyError && (
        <p className="border border-amber-700/30 bg-amber-50 p-3 text-xs text-amber-950" role="status">
          {t("reportPicHistoryError")}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">{t("reportNoPicData")}</p>
      ) : (
        <div className="overflow-x-auto border border-border bg-card">
          <table className="report-print-table w-full min-w-[1120px] text-left text-xs">
            <thead className="bg-secondary/70 text-[10px] uppercase tracking-wide">
              <tr>
                <th className="p-2">{t("reportOperator")}</th>
                <th className="p-2 text-right">{t("reportJobs")}</th>
                <th className="p-2 text-right">{t("reportSerials")}</th>
                <th className="p-2 text-right">{t("reportEntries")}</th>
                <th className="p-2 text-right">{t("reportExpectedShiftL")} (L)</th>
                <th className="p-2 text-right">{t("reportActualScoredL")} (L)</th>
                <th className="p-2 text-right">{t("reportTotal")} (L)</th>
                <th className="p-2 text-right">{t("reportLitersVariance")} (L)</th>
                <th className="p-2 text-right">{t("reportEfficiency")} (%)</th>
                <th className="p-2 text-right">{t("reportOverconsumptionShifts")}</th>
                <th className="p-2">{t("reportScoringQuality")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="p-2 font-semibold">{row.operatorName}</td>
                  <td className="p-2 text-right font-mono">{row.jobCount}</td>
                  <td className="p-2 text-right font-mono">{row.serialCount}</td>
                  <td className="p-2 text-right font-mono">{row.recordCount}</td>
                  <td className="p-2 text-right font-mono">{formatLiters(row.expectedL)}</td>
                  <td className="p-2 text-right font-mono">{formatLiters(row.scoredActualL)}</td>
                  <td className="p-2 text-right font-mono">{formatLiters(row.allActualL)}</td>
                  <td className={`p-2 text-right font-mono font-bold ${row.varianceL === null ? "text-muted-foreground" : row.varianceL >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                    {row.varianceL === null ? "—" : `${row.varianceL > 0 ? "+" : ""}${formatLiters(row.varianceL)}`}
                  </td>
                  <td className={`p-2 text-right font-mono font-bold ${row.variancePct === null ? "text-muted-foreground" : row.variancePct >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                    {row.variancePct === null ? "—" : `${row.variancePct > 0 ? "+" : ""}${formatLiters(row.variancePct)}%`}
                  </td>
                  <td className="p-2 text-right font-mono">{row.overconsumptionCount}</td>
                  <td className="whitespace-nowrap p-2 text-[10px]">
                    {t("reportScoredShifts")}: {row.scoredShiftCount} · {t("reportEstimatedShifts")}: {row.estimatedShiftCount} · {t("reportUnscoredShifts")}: {row.unscoredShiftCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
