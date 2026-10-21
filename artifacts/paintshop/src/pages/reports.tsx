import { useMemo, useState } from "react";
import {
  getListJobWorkflowHistoryQueryKey,
  getListJobWorkflowQueryKey,
  getListPaintUsageQueryKey,
  useListJobWorkflow,
  useListJobWorkflowHistory,
  useListPaintUsage,
} from "@workspace/api-client-react";
import { Download, FileSpreadsheet, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";

type ReportMode = "usage" | "qc";
type Period = "week" | "month";

function datePart(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPeriodRange(period: Period, offset: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let end: Date;

  if (period === "week") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset + offset * 7);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else {
    start.setDate(1);
    start.setMonth(start.getMonth() + offset);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  }

  const from = datePart(start);
  const to = datePart(end);
  return {
    from,
    to,
    fromDate: new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString(),
    toDate: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).toISOString(),
  };
}

function actualTotal(record: {
  primerActualTotalL: number;
  topcoatActualTotalL: number;
  customPaintActuals: { actualLiters: number }[];
}) {
  return record.primerActualTotalL + record.topcoatActualTotalL
    + record.customPaintActuals.reduce((sum, stage) => sum + stage.actualLiters, 0);
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

function formatMoney(value: number | null, currency: string | null, locale: string, fallback: string) {
  if (value === null || !currency) return fallback;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`;
  }
}

function eventTranslationKey(eventType: string) {
  if (eventType === "paint_usage_recorded") return "usageRecorded";
  if (eventType === "progress_updated") return "progressUpdated";
  if (eventType === "handed_over") return "handedOver";
  if (eventType === "shipment_verified") return "shipmentVerified";
  return eventType;
}

function statusTranslationKey(status: string) {
  if (status === "in_progress") return "working";
  if (status === "shipment") return "pending";
  return status;
}

export function Reports() {
  const { language, t } = useLanguage();
  const [mode, setMode] = useState<ReportMode>("usage");
  const [period, setPeriod] = useState<Period>("week");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedSerialId, setSelectedSerialId] = useState("");
  const [exportError, setExportError] = useState("");
  const range = useMemo(() => getPeriodRange(period, periodOffset), [period, periodOffset]);
  const usageParams = useMemo(
    () => ({ fromDate: range.fromDate, toDate: range.toDate }),
    [range.fromDate, range.toDate],
  );

  const workflowQuery = useListJobWorkflow(undefined, {
    query: { queryKey: getListJobWorkflowQueryKey(), refetchInterval: 30000 },
  });
  const periodUsageQuery = useListPaintUsage(usageParams, {
    query: { queryKey: getListPaintUsageQueryKey(usageParams) },
  });
  const serialId = Number(selectedSerialId) || 0;
  const qcUsageParams = useMemo(
    () => ({ serialNumberId: serialId || undefined }),
    [serialId],
  );
  const qcUsageQuery = useListPaintUsage(qcUsageParams, {
    query: {
      queryKey: getListPaintUsageQueryKey(qcUsageParams),
      enabled: mode === "qc" && serialId > 0,
    },
  });
  const qcHistoryQuery = useListJobWorkflowHistory(serialId, {
    query: {
      queryKey: getListJobWorkflowHistoryQueryKey(serialId),
      enabled: mode === "qc" && serialId > 0,
    },
  });

  const workflowItems = workflowQuery.data ?? [];
  const workflowBySerial = useMemo(
    () => new Map(workflowItems.map((item) => [item.serialNumberId, item])),
    [workflowItems],
  );
  const periodRecords = periodUsageQuery.data ?? [];
  const serialSummaries = useMemo(() => {
    const groups = new Map<number, {
      serialNumberId: number;
      records: typeof periodRecords;
      primerL: number;
      topcoatL: number;
      addOnL: number;
    }>();

    for (const record of periodRecords) {
      const group = groups.get(record.serialNumberId) ?? {
        serialNumberId: record.serialNumberId,
        records: [],
        primerL: 0,
        topcoatL: 0,
        addOnL: 0,
      };
      group.records.push(record);
      group.primerL += record.primerActualTotalL;
      group.topcoatL += record.topcoatActualTotalL;
      group.addOnL += record.customPaintActuals.reduce((sum, stage) => sum + stage.actualLiters, 0);
      groups.set(record.serialNumberId, group);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        workflow: workflowBySerial.get(group.serialNumberId),
        totalL: group.primerL + group.topcoatL + group.addOnL,
      }))
      .sort((a, b) => {
        const customerCompare = (a.workflow?.customerName ?? "").localeCompare(b.workflow?.customerName ?? "");
        return customerCompare || (a.workflow?.jobNo ?? "").localeCompare(b.workflow?.jobNo ?? "")
          || (a.workflow?.serialNo ?? "").localeCompare(b.workflow?.serialNo ?? "");
      });
  }, [periodRecords, workflowBySerial]);

  const jobSummaries = useMemo(() => {
    type JobGroup = {
      jobItemId: number;
      jobNo: string;
      customerName: string;
      serialIds: Set<number>;
      targetTotalL: number;
      periodActualL: number;
      expectedProgressL: number;
      actualToDateL: number;
      literVariance: number;
      expectedCost: number;
      actualCost: number;
      currency: string | null;
      costComplete: boolean;
      currencyConflict: boolean;
    };

    const activeJobIds = new Set(periodRecords.map((record) => record.jobItemId));
    const groups = new Map<number, JobGroup>();
    const getGroup = (jobItemId: number, jobNo: string, customerName: string) => {
      let group = groups.get(jobItemId);
      if (!group) {
        group = {
          jobItemId,
          jobNo,
          customerName,
          serialIds: new Set(),
          targetTotalL: 0,
          periodActualL: 0,
          expectedProgressL: 0,
          actualToDateL: 0,
          literVariance: 0,
          expectedCost: 0,
          actualCost: 0,
          currency: null,
          costComplete: true,
          currencyConflict: false,
        };
        groups.set(jobItemId, group);
      }
      return group;
    };

    for (const item of workflowItems) {
      if (!activeJobIds.has(item.jobItemId)) continue;
      const group = getGroup(item.jobItemId, item.jobNo, item.customerName);
      group.serialIds.add(item.serialNumberId);
      group.targetTotalL += item.targetTotalL;
      group.expectedProgressL += item.expectedProgressLiters;
      group.actualToDateL += item.actualTotalL;
      group.literVariance += item.literVariance;
      if (
        item.expectedMaterialCost === null ||
        item.actualMaterialCost === null ||
        item.materialCostVariance === null ||
        item.materialCostCurrency === null
      ) {
        group.costComplete = false;
      } else {
        if (group.currency && group.currency !== item.materialCostCurrency) group.currencyConflict = true;
        group.currency ??= item.materialCostCurrency;
        group.expectedCost += item.expectedMaterialCost;
        group.actualCost += item.actualMaterialCost;
      }
    }

    for (const record of periodRecords) {
      const workflow = workflowBySerial.get(record.serialNumberId);
      const group = getGroup(record.jobItemId, record.jobNo, workflow?.customerName ?? "—");
      group.serialIds.add(record.serialNumberId);
      group.periodActualL += actualTotal(record);
    }

    return [...groups.values()]
      .map((group) => {
        const costVariance = group.costComplete && !group.currencyConflict
          ? group.expectedCost - group.actualCost
          : null;
        return {
          ...group,
          serialCount: group.serialIds.size,
          costVariance,
          costVariancePct: costVariance !== null && group.expectedCost !== 0
            ? (costVariance / group.expectedCost) * 100
            : null,
          efficiencyPct: group.expectedProgressL !== 0
            ? (group.literVariance / group.expectedProgressL) * 100
            : null,
        };
      })
      .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.jobNo.localeCompare(b.jobNo));
  }, [periodRecords, workflowItems, workflowBySerial]);

  const totalPrimerL = periodRecords.reduce((sum, record) => sum + record.primerActualTotalL, 0);
  const totalTopcoatL = periodRecords.reduce((sum, record) => sum + record.topcoatActualTotalL, 0);
  const totalAddOnL = periodRecords.reduce(
    (sum, record) => sum + record.customPaintActuals.reduce((stageSum, stage) => stageSum + stage.actualLiters, 0),
    0,
  );
  const totalUsedL = totalPrimerL + totalTopcoatL + totalAddOnL;
  const selectedWorkflow = workflowBySerial.get(serialId);
  const qcRecords = qcUsageQuery.data ?? [];
  const qcHistory = qcHistoryQuery.data ?? [];
  const locale = language === "id" ? "id-ID" : "en-US";
  const formatLiters = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const formatDate = (value: Date | string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  const formatDateTime = (value: Date | string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const periodLabel = `${range.from} – ${range.to}`;

  async function downloadExcel() {
    setExportError("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      if (mode === "qc" && selectedWorkflow) {
        const summary = [
          [t("reportTitle")],
          [t("reportCustomer"), selectedWorkflow.customerName],
          [t("reportJobNo"), selectedWorkflow.jobNo],
          [t("reportSerialNo"), selectedWorkflow.serialNo],
          [t("reportStatus"), t(statusTranslationKey(selectedWorkflow.workStatus))],
          [t("reportProgress"), `${selectedWorkflow.progressPct}%`],
          [t("reportTargetPerSerial"), selectedWorkflow.targetTotalL],
          [t("reportExpectedProgress"), selectedWorkflow.expectedProgressLiters],
          [t("reportActualToDate"), selectedWorkflow.actualTotalL],
          [t("reportExpectedCost"), selectedWorkflow.expectedMaterialCost ?? t("reportCurrencyUnknown")],
          [t("reportActualCost"), selectedWorkflow.actualMaterialCost ?? t("reportCurrencyUnknown")],
          [t("reportCostVariance"), selectedWorkflow.materialCostVariance ?? t("reportCurrencyUnknown")],
          [t("reportCostVariancePct"), selectedWorkflow.materialCostVariancePct === null ? "" : `${selectedWorkflow.materialCostVariancePct}%`],
          [t("reportCurrency"), selectedWorkflow.materialCostCurrency ?? ""],
        ];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "QC Summary");

        const usageRows = qcRecords.map((record) => ({
          [t("reportDate")]: formatDateTime(record.usageDate),
          [t("reportShift")]: record.shift,
          [t("reportCategory")]: t(record.category),
          [t("reportOperator")]: record.operatorName ?? "—",
          [t("reportPrimerBase")]: record.primerBaseActualL,
          [t("reportPrimerHardener")]: record.primerHrdActualL,
          [t("reportPrimerThinner")]: record.primerThinnerActualL,
          [t("reportPrimer")]: record.primerActualTotalL,
          [t("reportTopcoatBase")]: record.topcoatBaseActualL,
          [t("reportTopcoatHardener")]: record.topcoatHrdActualL,
          [t("reportTopcoatThinner")]: record.topcoatThinnerActualL,
          [t("reportTopcoat")]: record.topcoatActualTotalL,
          [t("reportAdditionalStages")]: record.customPaintActuals.map((stage) => `${stage.name}: ${stage.actualLiters} L`).join("; "),
          [t("reportTotal")]: actualTotal(record),
          [t("reportNotes")]: record.notes ?? "",
        }));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(usageRows), "QC Usage");
        const historyRows = qcHistory.map((event) => ({
          [t("reportDate")]: formatDateTime(event.createdAt),
          [t("reportWorkHistory")]: t(eventTranslationKey(event.eventType)),
          [t("reportShift")]: event.shift ?? "",
          [t("reportProgress")]: event.progressPct === null ? "" : `${event.progressPct}%`,
          [t("reportOperator")]: event.actorName ?? "—",
          [t("reportNotes")]: event.note ?? "",
        }));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(historyRows), "Work History");
        XLSX.writeFile(workbook, `paintshop-qc-${safeFilename(selectedWorkflow.jobNo)}-${safeFilename(selectedWorkflow.serialNo)}.xlsx`);
        return;
      }

      const summary = [
        [t("reportTitle")],
        [t("reportPeriod"), period === "week" ? t("weekly") : t("monthly")],
        [t("reportDate"), periodLabel],
        [t("reportEntries"), periodRecords.length],
        [t("reportJobs"), jobSummaries.length],
        [t("reportSerials"), serialSummaries.length],
        [t("reportPrimer"), totalPrimerL],
        [t("reportTopcoat"), totalTopcoatL],
        [t("reportAddOn"), totalAddOnL],
        [t("reportTotal"), totalUsedL],
        [t("reportTargetPerJob"), jobSummaries.reduce((sum, group) => sum + group.targetTotalL, 0)],
        [t("reportExpectedProgress"), jobSummaries.reduce((sum, group) => sum + group.expectedProgressL, 0)],
        [t("reportActualToDate"), jobSummaries.reduce((sum, group) => sum + group.actualToDateL, 0)],
        [t("reportLitersVariance"), jobSummaries.reduce((sum, group) => sum + group.literVariance, 0)],
        [t("reportEfficiency"), (() => {
          const expected = jobSummaries.reduce((sum, group) => sum + group.expectedProgressL, 0);
          const variance = jobSummaries.reduce((sum, group) => sum + group.literVariance, 0);
          return expected === 0 ? "" : (variance / expected) * 100;
        })()],
        [t("reportCostVariance"), jobSummaries.length > 0 && jobSummaries.every((group) => group.costVariance !== null)
          ? jobSummaries.reduce((sum, group) => sum + (group.costVariance ?? 0), 0)
          : t("reportCurrencyUnknown")],
        [t("reportCurrentSnapshotNote")],
        [t("reportTargetNote")],
      ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "Summary");

      const jobRows = jobSummaries.map((group) => ({
        [t("reportCustomer")]: group.customerName,
        [t("reportJobNo")]: group.jobNo,
        [t("reportSerials")]: group.serialCount,
        [t("reportTargetPerJob")]: group.targetTotalL,
        [t("reportActualInPeriod")]: group.periodActualL,
        [t("reportExpectedProgress")]: group.expectedProgressL,
        [t("reportActualToDate")]: group.actualToDateL,
        [t("reportLitersVariance")]: group.literVariance,
        [t("reportEfficiency")]: group.efficiencyPct ?? "",
        [t("reportExpectedCost")]: group.costComplete && !group.currencyConflict ? group.expectedCost : "",
        [t("reportActualCost")]: group.costComplete && !group.currencyConflict ? group.actualCost : "",
        [t("reportCostVariance")]: group.costVariance ?? "",
        [t("reportCostVariancePct")]: group.costVariancePct ?? "",
        [t("reportCurrency")]: group.currency ?? "",
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(jobRows), "By Job");

      const serialRows = serialSummaries.map((group) => ({
        [t("reportCustomer")]: group.workflow?.customerName ?? "—",
        [t("reportJobNo")]: group.workflow?.jobNo ?? group.records[0]?.jobNo ?? "—",
        [t("reportSerialNo")]: group.workflow?.serialNo ?? group.records[0]?.serialNo ?? "—",
        [t("reportTargetPerSerial")]: group.workflow?.targetTotalL ?? "",
        [t("reportPrimer")]: group.primerL,
        [t("reportTopcoat")]: group.topcoatL,
        [t("reportAddOn")]: group.addOnL,
        [t("reportActualInPeriod")]: group.totalL,
        [t("reportProgress")]: group.workflow ? `${group.workflow.progressPct}%` : "",
        [t("reportExpectedCost")]: group.workflow?.expectedMaterialCost ?? "",
        [t("reportActualCost")]: group.workflow?.actualMaterialCost ?? "",
        [t("reportCostVariance")]: group.workflow?.materialCostVariance ?? "",
        [t("reportCostVariancePct")]: group.workflow?.materialCostVariancePct ?? "",
        [t("reportCurrency")]: group.workflow?.materialCostCurrency ?? "",
      }));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(serialRows), "By Serial");

      const detailRows = periodRecords.map((record) => {
        const workflow = workflowBySerial.get(record.serialNumberId);
        return {
          [t("reportDate")]: formatDateTime(record.usageDate),
          [t("reportCustomer")]: workflow?.customerName ?? "—",
          [t("reportJobNo")]: record.jobNo,
          [t("reportSerialNo")]: record.serialNo,
          [t("reportShift")]: record.shift,
          [t("reportCategory")]: t(record.category),
          [t("reportOperator")]: record.operatorName ?? "—",
          [t("reportPrimerBase")]: record.primerBaseActualL,
          [t("reportPrimerHardener")]: record.primerHrdActualL,
          [t("reportPrimerThinner")]: record.primerThinnerActualL,
          [t("reportPrimer")]: record.primerActualTotalL,
          [t("reportTopcoatBase")]: record.topcoatBaseActualL,
          [t("reportTopcoatHardener")]: record.topcoatHrdActualL,
          [t("reportTopcoatThinner")]: record.topcoatThinnerActualL,
          [t("reportTopcoat")]: record.topcoatActualTotalL,
          [t("reportAdditionalStages")]: record.customPaintActuals.map((stage) => `${stage.name}: ${stage.actualLiters} L`).join("; "),
          [t("reportTotal")]: actualTotal(record),
          [t("reportNotes")]: record.notes ?? "",
        };
      });
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), "Usage Details");
      XLSX.writeFile(workbook, `paintshop-${period}-${range.from}-${range.to}.xlsx`);
    } catch {
      setExportError(t("reportExportError"));
    }
  }

  const isLoading = workflowQuery.isLoading || (mode === "usage" ? periodUsageQuery.isLoading : Boolean(serialId && (qcUsageQuery.isLoading || qcHistoryQuery.isLoading)));
  const hasError = workflowQuery.isError || (mode === "usage" ? periodUsageQuery.isError : Boolean(serialId && (qcUsageQuery.isError || qcHistoryQuery.isError)));

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          #paintshop-report-print, #paintshop-report-print * { visibility: visible !important; }
          #paintshop-report-print { position: fixed !important; inset: 0 !important; width: 100% !important; overflow: visible !important; background: white !important; color: black !important; }
          .report-no-print { display: none !important; }
          .report-print-table { border-collapse: collapse !important; width: 100% !important; }
          .report-print-table th, .report-print-table td { border: 1px solid #999 !important; color: #111 !important; padding: 4px !important; font-size: 9px !important; }
          .report-print-card { border: 1px solid #999 !important; background: white !important; color: black !important; }
        }
      `}</style>

      <header className="report-no-print flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">{t("reports")}</p>
          <h1 className="mt-1 text-3xl font-extrabold uppercase tracking-tight">{t("reportTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("reportDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "usage" ? "default" : "outline"} onClick={() => setMode("usage")} data-testid="button-report-usage">{t("reportUsageDetails")}</Button>
          <Button variant={mode === "qc" ? "default" : "outline"} onClick={() => setMode("qc")} data-testid="button-report-qc">{t("reportQcUsage")}</Button>
        </div>
      </header>

      <section className="report-no-print flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-3">
        {mode === "usage" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={period === "week" ? "default" : "outline"} onClick={() => { setPeriod("week"); setPeriodOffset(0); }}>{t("weekly")}</Button>
            <Button size="sm" variant={period === "month" ? "default" : "outline"} onClick={() => { setPeriod("month"); setPeriodOffset(0); }}>{t("monthly")}</Button>
            <div className="ml-1 flex items-center gap-1">
              <Button size="icon" variant="outline" aria-label={t("previousPeriod")} onClick={() => setPeriodOffset((value) => value - 1)}><ChevronLeft size={16}/></Button>
              <span className="min-w-44 text-center text-sm font-semibold">{periodLabel}</span>
              <Button size="icon" variant="outline" aria-label={t("nextPeriod")} onClick={() => setPeriodOffset((value) => Math.min(0, value + 1))} disabled={periodOffset === 0}><ChevronRight size={16}/></Button>
            </div>
          </div>
        ) : (
          <label className="flex min-w-64 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("reportSelectSerial")}
            <select className="h-10 border border-input bg-background px-3 text-sm font-medium text-foreground" value={selectedSerialId} onChange={(event) => setSelectedSerialId(event.target.value)}>
              <option value="">{t("reportChooseSerial")}</option>
              {workflowItems.map((item) => (
                <option value={item.serialNumberId} key={item.serialNumberId}>{item.customerName} · {item.jobNo} · SN {item.serialNo}</option>
              ))}
            </select>
          </label>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={mode === "qc" && !selectedWorkflow} data-testid="button-report-pdf"><Printer size={15} className="mr-2"/>{t("reportPdf")}</Button>
          <Button onClick={() => void downloadExcel()} disabled={isLoading || (mode === "qc" && !selectedWorkflow)} data-testid="button-report-excel"><FileSpreadsheet size={15} className="mr-2"/>{t("reportExcel")}<Download size={14} className="ml-2"/></Button>
        </div>
      </section>

      {exportError && <p className="report-no-print border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">{exportError}</p>}
      {isLoading && <p className="border border-border bg-card p-5 text-sm text-muted-foreground">{t("reportLoading")}</p>}
      {hasError && <p className="border border-destructive/30 bg-destructive/10 p-5 text-sm font-semibold text-destructive">{t("reportError")}</p>}

      {!isLoading && !hasError && mode === "usage" && (
        <div id="paintshop-report-print" className="space-y-5">
          <header className="hidden print:block">
            <h1 className="text-xl font-bold">{t("reportTitle")}</h1>
            <p>{period === "week" ? t("weekly") : t("monthly")} · {periodLabel}</p>
          </header>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              [t("reportEntries"), periodRecords.length],
              [t("reportJobs"), new Set(periodRecords.map((record) => record.jobItemId)).size],
              [t("reportSerials"), serialSummaries.length],
              [t("reportPrimer"), `${formatLiters(totalPrimerL)} L`],
              [t("reportTotal"), `${formatLiters(totalUsedL)} L`],
            ].map(([label, value]) => (
              <div key={String(label)} className="report-print-card border border-border bg-card p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="mt-2 font-mono text-2xl font-extrabold">{value}</p>
              </div>
            ))}
          </section>
          {periodRecords.length === 0 ? (
            <p className="border border-border bg-card p-6 text-center text-sm text-muted-foreground">{t("reportNoUsage")}</p>
          ) : (
            <>
              <section className="space-y-2">
                <h2 className="text-xs font-extrabold uppercase tracking-widest">{t("reportJobSummary")}</h2>
                {jobSummaries.length === 0 ? (
                  <p className="border border-border bg-card p-4 text-sm text-muted-foreground">{t("reportNoUsage")}</p>
                ) : (
                  <div className="overflow-x-auto border border-border bg-card">
                    <table className="report-print-table w-full min-w-[1100px] text-left text-xs">
                      <thead className="bg-secondary/70 text-[10px] uppercase tracking-wide">
                        <tr><th className="p-2">{t("reportCustomer")}</th><th className="p-2">{t("reportJobNo")}</th><th className="p-2 text-right">{t("reportSerials")}</th><th className="p-2 text-right">{t("reportTargetPerJob")} (L)</th><th className="p-2 text-right">{t("reportActualInPeriod")} (L)</th><th className="p-2 text-right">{t("reportExpectedProgress")} (L)</th><th className="p-2 text-right">{t("reportActualToDate")} (L)</th><th className="p-2 text-right">{t("reportLitersVariance")} (L)</th><th className="p-2 text-right">{t("reportEfficiency")} (%)</th><th className="p-2 text-right">{t("reportCostVariance")}</th></tr>
                      </thead>
                      <tbody>
                        {jobSummaries.map((group) => (
                          <tr key={group.jobItemId} className="border-t border-border">
                            <td className="p-2">{group.customerName}</td>
                            <td className="p-2 font-mono font-bold">{group.jobNo}</td>
                            <td className="p-2 text-right font-mono">{group.serialCount}</td>
                            <td className="p-2 text-right font-mono">{formatLiters(group.targetTotalL)}</td>
                            <td className="p-2 text-right font-mono">{formatLiters(group.periodActualL)}</td>
                            <td className="p-2 text-right font-mono">{formatLiters(group.expectedProgressL)}</td>
                            <td className="p-2 text-right font-mono">{formatLiters(group.actualToDateL)}</td>
                            <td className={`p-2 text-right font-mono font-bold ${group.literVariance >= 0 ? "text-emerald-700" : "text-destructive"}`}>{group.literVariance > 0 ? "+" : ""}{formatLiters(group.literVariance)}</td>
                            <td className={`p-2 text-right font-mono font-bold ${group.efficiencyPct === null ? "text-muted-foreground" : group.efficiencyPct >= 0 ? "text-emerald-700" : "text-destructive"}`}>{group.efficiencyPct === null ? "—" : `${group.efficiencyPct > 0 ? "+" : ""}${formatLiters(group.efficiencyPct)}%`}</td>
                            <td className={`p-2 text-right font-mono font-bold ${group.costVariance === null ? "text-muted-foreground" : group.costVariance >= 0 ? "text-emerald-700" : "text-destructive"}`}>{group.costVariance === null ? t("reportCurrencyUnknown") : `${group.costVariance >= 0 ? "+" : ""}${formatMoney(group.costVariance, group.currency, locale, t("reportCurrencyUnknown"))}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">{t("reportTargetNote")}</p>
                <p className="text-[10px] text-muted-foreground">{t("reportCurrentSnapshotNote")}</p>
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-extrabold uppercase tracking-widest">{t("reportSerialSummary")}</h2>
                <div className="overflow-x-auto border border-border bg-card">
                  <table className="report-print-table w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-secondary/70 text-[10px] uppercase tracking-wide">
                      <tr><th className="p-2">{t("reportCustomer")}</th><th className="p-2">{t("reportJobNo")}</th><th className="p-2">{t("reportSerialNo")}</th><th className="p-2 text-right">{t("reportTargetPerSerial")} (L)</th><th className="p-2 text-right">{t("reportPrimer")} (L)</th><th className="p-2 text-right">{t("reportTopcoat")} (L)</th><th className="p-2 text-right">{t("reportAddOn")} (L)</th><th className="p-2 text-right">{t("reportActualInPeriod")} (L)</th></tr>
                    </thead>
                    <tbody>
                      {serialSummaries.map((group) => (
                        <tr key={group.serialNumberId} className="border-t border-border">
                          <td className="p-2">{group.workflow?.customerName ?? "—"}</td>
                          <td className="p-2 font-mono font-bold">{group.workflow?.jobNo ?? group.records[0]?.jobNo}</td>
                          <td className="p-2 font-mono">{group.workflow?.serialNo ?? group.records[0]?.serialNo}</td>
                          <td className="p-2 text-right font-mono">{group.workflow ? formatLiters(group.workflow.targetTotalL) : "—"}</td>
                          <td className="p-2 text-right font-mono">{formatLiters(group.primerL)}</td>
                          <td className="p-2 text-right font-mono">{formatLiters(group.topcoatL)}</td>
                          <td className="p-2 text-right font-mono">{formatLiters(group.addOnL)}</td>
                          <td className="p-2 text-right font-mono font-bold">{formatLiters(group.totalL)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-extrabold uppercase tracking-widest">{t("reportUsageDetails")}</h2>
                <div className="overflow-x-auto border border-border bg-card">
                  <table className="report-print-table w-full min-w-[1200px] text-left text-xs">
                    <thead className="bg-secondary/70 text-[10px] uppercase tracking-wide">
                      <tr>
                        <th className="p-2">{t("reportDate")}</th><th className="p-2">{t("reportCustomer")}</th><th className="p-2">{t("reportJobNo")}</th><th className="p-2">{t("reportSerialNo")}</th><th className="p-2">{t("reportShift")}</th><th className="p-2">{t("reportCategory")}</th><th className="p-2">{t("reportOperator")}</th><th className="p-2 text-right">{t("reportPrimer")} (L)</th><th className="p-2 text-right">{t("reportTopcoat")} (L)</th><th className="p-2 text-right">{t("reportAddOn")} (L)</th><th className="p-2 text-right">{t("reportTotal")} (L)</th><th className="p-2">{t("reportNotes")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodRecords.map((record) => {
                        const workflow = workflowBySerial.get(record.serialNumberId);
                        const addOn = record.customPaintActuals.reduce((sum, stage) => sum + stage.actualLiters, 0);
                        return (
                          <tr key={record.id} className="border-t border-border">
                            <td className="whitespace-nowrap p-2">{formatDate(record.usageDate)}</td>
                            <td className="p-2">{workflow?.customerName ?? "—"}</td>
                            <td className="p-2 font-mono">{record.jobNo}</td>
                            <td className="p-2 font-mono">{record.serialNo}</td>
                            <td className="p-2">{record.shift}</td>
                            <td className="p-2">{t(record.category)}</td>
                            <td className="p-2">{record.operatorName ?? "—"}</td>
                            <td className="p-2 text-right font-mono">{formatLiters(record.primerActualTotalL)}</td>
                            <td className="p-2 text-right font-mono">{formatLiters(record.topcoatActualTotalL)}</td>
                            <td className="p-2 text-right font-mono">{formatLiters(addOn)}</td>
                            <td className="p-2 text-right font-mono font-bold">{formatLiters(actualTotal(record))}</td>
                            <td className="max-w-48 p-2">{record.notes ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="text-[10px] text-muted-foreground">{t("reportTargetNote")}</p>
            </>
          )}
        </div>
      )}

      {!isLoading && !hasError && mode === "qc" && (
        <div id="paintshop-report-print" className="space-y-5">
          {!selectedWorkflow ? (
            <p className="border border-border bg-card p-6 text-center text-sm text-muted-foreground">{workflowItems.length === 0 ? t("reportNoSerials") : t("reportChooseSerial")}</p>
          ) : (
            <>
              <header className="border-b border-border pb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">IEG · {t("reportQcUsage")}</p>
                <h2 className="mt-1 text-2xl font-extrabold">{selectedWorkflow.customerName} · {selectedWorkflow.jobNo} · SN {selectedWorkflow.serialNo}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedWorkflow.description}</p>
              </header>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  [t("reportStatus"), t(statusTranslationKey(selectedWorkflow.workStatus))],
                  [t("reportProgress"), `${selectedWorkflow.progressPct}%`],
                  [t("reportTargetPerSerial"), `${formatLiters(selectedWorkflow.targetTotalL)} L`],
                  [t("reportExpectedProgress"), `${formatLiters(selectedWorkflow.expectedProgressLiters)} L`],
                  [t("reportActualToDate"), `${formatLiters(selectedWorkflow.actualTotalL)} L`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="report-print-card border border-border bg-card p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                    <p className="mt-2 font-mono text-lg font-extrabold">{value}</p>
                  </div>
                ))}
              </section>
              <section className={`report-print-card border p-4 ${selectedWorkflow.materialCostVariance === null ? "border-border bg-card" : selectedWorkflow.materialCostVariance >= 0 ? "border-emerald-700/30 bg-emerald-50 text-emerald-900" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest">{t("reportCostVariance")}</p>
                {selectedWorkflow.materialCostVariance === null ? (
                  <p className="mt-1 text-sm">{t("reportCurrencyUnknown")}</p>
                ) : (
                  <>
                    <p className="mt-1 font-mono text-xl font-extrabold">
                      {selectedWorkflow.materialCostVariance >= 0 ? "+" : ""}{formatMoney(selectedWorkflow.materialCostVariance, selectedWorkflow.materialCostCurrency, locale, t("reportCurrencyUnknown"))}
                      {selectedWorkflow.materialCostVariancePct !== null && ` (${selectedWorkflow.materialCostVariancePct >= 0 ? "+" : ""}${formatLiters(selectedWorkflow.materialCostVariancePct)}%)`}
                    </p>
                    <p className="mt-2 text-xs">
                      {t("reportExpectedCost")}: {formatMoney(selectedWorkflow.expectedMaterialCost, selectedWorkflow.materialCostCurrency, locale, "—")} · {t("reportActualCost")}: {formatMoney(selectedWorkflow.actualMaterialCost, selectedWorkflow.materialCostCurrency, locale, "—")}
                    </p>
                  </>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-widest">{t("reportQcUsage")}</h3>
                {qcUsageQuery.isLoading ? <p className="p-4 text-sm text-muted-foreground">{t("reportLoading")}</p>
                  : qcRecords.length === 0 ? <p className="border border-border bg-card p-4 text-sm text-muted-foreground">{t("reportNoUsage")}</p>
                  : <div className="overflow-x-auto border border-border bg-card">
                    <table className="report-print-table w-full min-w-[1050px] text-left text-xs">
                      <thead className="bg-secondary/70 text-[10px] uppercase tracking-wide"><tr><th className="p-2">{t("reportDate")}</th><th className="p-2">{t("reportShift")}</th><th className="p-2">{t("reportCategory")}</th><th className="p-2">{t("reportOperator")}</th><th className="p-2 text-right">{t("reportPrimer")} (L)</th><th className="p-2 text-right">{t("reportTopcoat")} (L)</th><th className="p-2">{t("reportAdditionalStages")}</th><th className="p-2 text-right">{t("reportTotal")} (L)</th><th className="p-2">{t("reportNotes")}</th></tr></thead>
                      <tbody>{qcRecords.map((record) => (
                        <tr key={record.id} className="border-t border-border">
                          <td className="whitespace-nowrap p-2">{formatDateTime(record.usageDate)}</td><td className="p-2">{record.shift}</td><td className="p-2">{t(record.category)}</td><td className="p-2">{record.operatorName ?? "—"}</td><td className="p-2 text-right font-mono">{formatLiters(record.primerActualTotalL)}</td><td className="p-2 text-right font-mono">{formatLiters(record.topcoatActualTotalL)}</td>
                          <td className="p-2">{record.customPaintActuals.map((stage) => `${stage.name}: ${formatLiters(stage.actualLiters)} L`).join(", ") || "—"}</td><td className="p-2 text-right font-mono font-bold">{formatLiters(actualTotal(record))}</td><td className="p-2">{record.notes ?? "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-widest">{t("reportWorkHistory")}</h3>
                {qcHistoryQuery.isLoading ? <p className="p-4 text-sm text-muted-foreground">{t("reportLoading")}</p>
                  : qcHistory.length === 0 ? <p className="border border-border bg-card p-4 text-sm text-muted-foreground">{t("reportNoHistory")}</p>
                  : <div className="overflow-x-auto border border-border bg-card"><table className="report-print-table w-full text-left text-xs">
                    <thead className="bg-secondary/70 text-[10px] uppercase tracking-wide"><tr><th className="p-2">{t("reportDate")}</th><th className="p-2">{t("reportWorkHistory")}</th><th className="p-2">{t("reportShift")}</th><th className="p-2">{t("reportProgress")}</th><th className="p-2">{t("reportOperator")}</th><th className="p-2">{t("reportNotes")}</th></tr></thead>
                    <tbody>{qcHistory.map((event) => (
                      <tr key={event.id} className="border-t border-border"><td className="whitespace-nowrap p-2">{formatDateTime(event.createdAt)}</td><td className="p-2">{t(eventTranslationKey(event.eventType))}</td><td className="p-2">{event.shift ?? "—"}</td><td className="p-2">{event.progressPct === null ? "—" : `${event.progressPct}%`}</td><td className="p-2">{event.actorName ?? "—"}</td><td className="p-2">{event.note ?? "—"}</td></tr>
                    ))}</tbody>
                  </table></div>}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
