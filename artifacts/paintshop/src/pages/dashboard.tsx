import { Link } from "wouter";
import { format } from "date-fns";
import { Activity, ArrowUpRight, ClipboardList, Clock3, PaintBucket, UsersRound } from "lucide-react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, type JobWorkflowItem, type PaintMixerStatus } from "@workspace/api-client-react";
import { useLanguage } from "@/lib/language";
import { CustomerPerformanceReport } from "@/components/customer-performance";

function elapsed(createdAt: string, language: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return language === "id"
    ? hours > 0 ? `${hours} jam ${remainder} mnt` : `${remainder} mnt`
    : hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function JobMonitorPanel({
  title,
  count,
  jobs,
  tone = "neutral",
  empty,
  language,
  href,
}: {
  title: string;
  count: number;
  jobs: JobWorkflowItem[];
  tone?: "neutral" | "danger" | "warning";
  empty: string;
  language: string;
  href: string;
}) {
  const countTone = tone === "danger" && count > 0
    ? "bg-destructive/10 text-destructive"
    : tone === "warning" && count > 0
      ? "bg-amber-100 text-amber-900"
      : "bg-secondary text-muted-foreground";

  return (
    <section className="flex min-w-0 flex-col border border-border bg-card" data-testid={`dashboard-monitor-${href.replace("/", "")}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/20 px-4 py-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wide">{title}</h3>
        <span className={`min-w-8 rounded-sm px-2 py-1 text-center font-mono text-xs font-bold ${countTone}`}>{count}</span>
      </div>
      <div className="max-h-[25rem] flex-1 overflow-y-auto divide-y divide-border">
        {jobs.length === 0 ? (
          <p className="p-5 text-center text-xs text-muted-foreground">{empty}</p>
        ) : jobs.map((job) => (
          <Link key={job.serialNumberId} href={href} className="block px-4 py-3 transition-colors hover:bg-secondary/30">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate font-mono text-xs font-extrabold text-primary">
                {job.jobNo} <span className="text-muted-foreground">/</span> {job.serialNo}
              </p>
              {job.workStatus === "queued" ? (
                <span className="shrink-0 font-mono text-[10px] font-bold text-muted-foreground">{elapsed(job.createdAt, language)}</span>
              ) : (
                <span className="shrink-0 font-mono text-[10px] font-bold">{job.progressPct}%</span>
              )}
            </div>
            <p className="mt-1 truncate text-xs font-semibold">{job.customerName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{job.description}</p>
            {job.workStatus !== "queued" && (
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">{job.actualTotalL.toLocaleString()} / {job.targetTotalL.toLocaleString()} L</span>
                <span className={`font-mono font-bold ${job.literVariance >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                  {job.literVariance > 0 ? "+" : ""}{job.literVariance.toLocaleString()} L
                </span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function MixerStatusPanel({ mixers, online, working, idling, language }: {
  mixers: PaintMixerStatus[];
  online: number;
  working: number;
  idling: number;
  language: string;
}) {
  const labels = language === "id"
    ? { title: "Status Paint Mixer", online: "Online", working: "Bekerja", idling: "Idle", noOne: "Belum ada Paint Mixer yang online", activeJob: "Sedang mengerjakan", available: "Tidak ada job aktif" }
    : { title: "Paint Mixer Status", online: "Online", working: "Working", idling: "Idling", noOne: "No Paint Mixers online", activeJob: "Working on", available: "No active job" };

  return (
    <section className="flex min-w-0 flex-col border border-border bg-card" data-testid="dashboard-mixer-status">
      <div className="border-b border-border bg-secondary/20 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide"><UsersRound size={14} className="text-primary" />{labels.title}</h3>
          <span className="font-mono text-[10px] text-muted-foreground">{labels.online} · {online}</span>
        </div>
        <div className="mt-2 flex gap-3 font-mono text-[10px]">
          <span className="text-emerald-700">{labels.working} {working}</span>
          <span className="text-amber-800">{labels.idling} {idling}</span>
        </div>
      </div>
      <div className="max-h-[25rem] flex-1 overflow-y-auto divide-y divide-border">
        {mixers.length === 0 ? (
          <p className="p-5 text-center text-xs text-muted-foreground">{labels.noOne}</p>
        ) : mixers.map((mixer) => (
          <div key={mixer.userId} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs font-bold">{mixer.name}</p>
              <span className={`shrink-0 text-[10px] font-bold ${mixer.state === "working" ? "text-emerald-700" : "text-amber-800"}`}>
                {mixer.state === "working" ? labels.working : labels.idling}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {mixer.currentJobNo
                ? `${labels.activeJob} ${mixer.currentJobNo} / ${mixer.currentSerialNo} · ${mixer.customerName}`
                : labels.available}
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {language === "id" ? "Aktif terakhir" : "Last active"} {format(new Date(mixer.lastSeenAt), language === "id" ? "HH:mm" : "h:mm a")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Dashboard() {
  const { t, language } = useLanguage();
  const { data, isLoading, error, refetch } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 30000 } });
  const labels = language === "id"
    ? {
        title: "Ringkasan Sistem",
        subtitle: "Status langsung operasional Paintshop.",
        monitor: "Monitor Operasional",
        delayed: "Antrean > 4 jam",
        waiting: "Antrean < 4 jam",
        shipment: "Shipment Work",
        noDelayed: "Tidak ada antrean lebih dari 4 jam.",
        noWaiting: "Tidak ada job yang menunggu di antrean.",
        noShipment: "Belum ada job menunggu verifikasi shipment.",
        newJobs: "Job Baru Hari Ini",
        delayNote: "Job antrean dikelompokkan berdasarkan lama menunggu. Status Paint Mixer diperbarui tiap 30 detik.",
      }
    : {
        title: "System Overview",
        subtitle: "Live status of Paintshop operations.",
        monitor: "Operations Monitor",
        delayed: "Queued over 4 hours",
        waiting: "Queued under 4 hours",
        shipment: "Shipment Work",
        noDelayed: "No jobs queued for more than 4 hours.",
        noWaiting: "No jobs currently waiting in the queue.",
        noShipment: "No jobs waiting for shipment verification.",
        newJobs: "New Jobs Today",
        delayNote: "Queued jobs are grouped by waiting time. Paint Mixer status refreshes every 30 seconds.",
      };
  const stats = data ? [
    { label: t("queued"), value: data.queuedCount, icon: ClipboardList, href: "/ongoing", tone: "neutral" },
    { label: t("active"), value: data.ongoingCount, icon: Clock3, href: "/ongoing", tone: "amber" },
    { label: t("completed"), value: data.completedTodayCount, icon: PaintBucket, href: "/ongoing", tone: "neutral" },
    { label: t("mixers"), value: data.paintMixersOnlineCount, icon: UsersRound, href: "/ongoing", tone: "green" },
  ] : [];
  return <div className="space-y-7 pb-10">
    <header className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">IEG / Paintshop Control</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">{labels.title}</h1><p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p></div>
      <p className="font-mono text-xs text-muted-foreground">{format(new Date(), language === "id" ? "dd MMM yyyy · HH:mm" : "MMM dd, yyyy · HH:mm")}</p>
    </header>
    {isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(i=><div key={i} className="h-28 animate-pulse border border-border bg-card p-4"><div className="h-3 w-1/2 bg-muted"/><div className="mt-5 h-8 w-1/3 bg-muted"/></div>)}</div> : error || !data ? <div className="border border-destructive/30 bg-destructive/10 p-5 text-sm font-semibold text-destructive" data-testid="error-dashboard">{t("dashboardLoadError")} <button onClick={() => void refetch()} className="ml-2 underline" data-testid="button-retry-dashboard">{t("retry")}</button></div> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label,value,icon:Icon,href,tone })=><Link key={label} href={href} className={`group relative min-h-28 overflow-hidden border bg-card p-4 transition-colors hover:border-primary/70 ${tone==="amber"?"border-primary/50 bg-primary/5":tone==="green"?"border-emerald-700/25 bg-emerald-50/50":"border-border"}`} data-testid={`card-dashboard-${label.toLowerCase().replaceAll(" ","-")}`}><div className="flex items-start justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-muted-foreground">{label}</p><Icon size={17} className={tone==="amber"?"text-primary":tone==="green"?"text-emerald-700":"text-muted-foreground"}/></div><div className="mt-4 flex items-end justify-between"><span className="font-mono text-4xl font-extrabold tracking-tight">{value}</span><ArrowUpRight size={16} className="text-primary opacity-0 transition-opacity group-hover:opacity-100"/></div>{label===t("mixers")&&<p className="mt-1 font-mono text-[10px] text-muted-foreground">{t("working")} {data.paintMixersWorkingCount} · {t("idling")} {data.paintMixersIdlingCount}</p>}</Link>)}
      </div>
      <section className="space-y-3" data-testid="section-operations-monitor">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
          <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide"><Activity className="h-4 w-4 text-primary"/>{labels.monitor}</h2>
          <span className="text-xs text-muted-foreground">{labels.newJobs}: <b className="font-mono text-foreground">{data.newJobsTodayCount}</b></span>
        </div>
        <div className="grid items-stretch gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <JobMonitorPanel title={labels.delayed} count={data.delayedCount} jobs={data.delayedJobs} tone="danger" empty={labels.noDelayed} language={language} href="/ongoing" />
          <JobMonitorPanel title={labels.waiting} count={Math.max(0, data.queuedCount - data.delayedCount)} jobs={data.waitingJobs} tone="warning" empty={labels.noWaiting} language={language} href="/ongoing" />
          <JobMonitorPanel title={labels.shipment} count={data.shipmentPendingCount} jobs={data.shipmentJobs} empty={labels.noShipment} language={language} href="/shipment" />
          <MixerStatusPanel mixers={data.paintMixerStatuses} online={data.paintMixersOnlineCount} working={data.paintMixersWorkingCount} idling={data.paintMixersIdlingCount} language={language} />
        </div>
        <p className="text-[11px] text-muted-foreground">{labels.delayNote}</p>
      </section>
      <CustomerPerformanceReport customers={data.customers} />
    </>}
  </div>;
}
