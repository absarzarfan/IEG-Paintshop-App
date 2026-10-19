import { Link } from "wouter";
import { format } from "date-fns";
import { Activity, ArrowUpRight, Boxes, ClipboardList, Clock3, PackageCheck, PaintBucket, UsersRound } from "lucide-react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useLanguage } from "@/lib/language";

export function Dashboard() {
  const { t, language } = useLanguage();
  const { data, isLoading, error, refetch } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const stats = data ? [
    { label: t("queued"), value: data.queuedCount, icon: ClipboardList, href: "/ongoing", tone: "neutral" },
    { label: t("active"), value: data.ongoingCount, icon: Clock3, href: "/ongoing", tone: "amber" },
    { label: t("completed"), value: data.completedTodayCount, icon: PaintBucket, href: "/ongoing", tone: "neutral" },
    { label: t("pending"), value: data.shipmentPendingCount, icon: PackageCheck, href: "/shipment", tone: "green" },
  ] : [];
  return <div className="space-y-7 pb-10">
    <header className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">IEG / Paintshop Control</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">{t("dashboard")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("overview")}</p></div>
      <p className="font-mono text-xs text-muted-foreground">{format(new Date(), language === "id" ? "dd MMM yyyy · HH:mm" : "MMM dd, yyyy · HH:mm")}</p>
    </header>
    {isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(i=><div key={i} className="h-28 animate-pulse border border-border bg-card p-4"><div className="h-3 w-1/2 bg-muted"/><div className="mt-5 h-8 w-1/3 bg-muted"/></div>)}</div> : error || !data ? <div className="border border-destructive/30 bg-destructive/10 p-5 text-sm font-semibold text-destructive" data-testid="error-dashboard">Dashboard summary unavailable. <button onClick={() => void refetch()} className="ml-2 underline" data-testid="button-retry-dashboard">{t("retry")}</button></div> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label,value,icon:Icon,href,tone })=><Link key={label} href={href} className={`group relative min-h-28 overflow-hidden border bg-card p-4 transition-colors hover:border-primary/70 ${tone==="amber"?"border-primary/50 bg-primary/5":tone==="green"?"border-emerald-700/25 bg-emerald-50/50":"border-border"}`} data-testid={`card-dashboard-${label.toLowerCase().replaceAll(" ","-")}`}><div className="flex items-start justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-muted-foreground">{label}</p><Icon size={17} className={tone==="amber"?"text-primary":tone==="green"?"text-emerald-700":"text-muted-foreground"}/></div><div className="mt-4 flex items-end justify-between"><span className="font-mono text-4xl font-extrabold tracking-tight">{value}</span><ArrowUpRight size={16} className="text-primary opacity-0 transition-opacity group-hover:opacity-100"/></div></Link>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-border bg-card px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("newJobs")}</p><p className="mt-1 font-mono text-2xl font-bold">{data.newJobsTodayCount}</p></div>
        <div className={`border bg-card px-4 py-3 ${data.delayedCount ? "border-destructive/40 bg-destructive/5" : "border-border"}`}><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("delayed")}</p><p className={`mt-1 font-mono text-2xl font-bold ${data.delayedCount?"text-destructive":""}`}>{data.delayedCount}</p></div>
        <div className="border border-border bg-card px-4 py-3 sm:col-span-2"><div className="flex items-center gap-2"><UsersRound size={15} className="text-primary"/><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("mixers")}</p></div><div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm"><span>{t("online")} <b>{data.paintMixersOnlineCount}</b></span><span>{t("working")} <b>{data.paintMixersWorkingCount}</b></span><span>{t("idling")} <b>{data.paintMixersIdlingCount}</b></span></div></div>
      </div>
      <section className="border border-border bg-card" data-testid="section-audit-activity"><div className="flex items-center justify-between border-b border-border bg-secondary/20 px-4 py-3"><h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide"><Activity className="h-4 w-4 text-primary"/>{t("recent")}</h2><Link href="/audit-log" className="text-xs font-bold text-primary hover:underline">{t("allActivity")}</Link></div>
        {!data.recentAuditEntries?.length ? <div className="p-10 text-center text-sm text-muted-foreground">{t("noActivity")}</div> : <div className="divide-y divide-border">{data.recentAuditEntries.map(entry=><div key={entry.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`audit-entry-${entry.id}`}><div className="flex items-center gap-3"><span className="min-w-16 border border-border bg-secondary px-2 py-1 text-center text-[10px] font-extrabold uppercase">{entry.action}</span><div><p className="text-sm font-bold">{entry.entityType} <span className="font-mono text-muted-foreground">#{entry.entityId}</span></p><p className="text-xs text-muted-foreground">by {entry.actorName || "—"}</p></div></div><time className="font-mono text-xs text-muted-foreground">{format(new Date(entry.createdAt), "dd MMM · HH:mm")}</time></div>)}</div>}
      </section>
      <div className="grid gap-3 sm:grid-cols-3"><Link href="/job-items" className="flex items-center justify-between border border-border bg-card p-4 hover:border-primary/50"><span className="flex items-center gap-2 text-sm font-bold"><PaintBucket size={16} className="text-primary"/> {t("jobs")}</span><span className="font-mono text-xl font-bold">{data.jobItemCount}</span></Link><div className="flex items-center justify-between border border-border bg-card p-4"><span className="flex items-center gap-2 text-sm font-bold"><Boxes size={16} className="text-primary"/>{t("materials")}</span><span className="font-mono text-xl font-bold">{data.materialCount}</span></div><div className="flex items-center justify-between border border-border bg-card p-4"><span className="text-sm font-bold">{t("colors")} / {t("brands")}</span><span className="font-mono text-xl font-bold">{data.colorCount} / {data.brandCount}</span></div></div>
    </>}
  </div>;
}
