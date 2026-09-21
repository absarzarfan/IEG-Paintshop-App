import { useGetDashboardSummary } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { PaintBucket, Droplet, Palette, Settings, Users, Activity, Loader2, ArrowRight } from "lucide-react";

export function Dashboard() {
  const { data: summary, isLoading, error } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 font-mono text-sm">
        Failed to load dashboard summary.
      </div>
    );
  }

  const statCards = [
    { label: "Job Items", value: summary.jobItemCount, icon: PaintBucket, href: "/job-items" },
    { label: "Materials", value: summary.materialCount, icon: Droplet, href: "/materials" },
    { label: "Colors", value: summary.colorCount, icon: Palette, href: "/colors" },
    { label: "Brands", value: summary.brandCount, icon: Settings, href: "/brands" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">DASHBOARD</h1>
        <p className="text-muted-foreground font-medium mt-1">Ringkasan master data dan aktivitas Paintshop.</p>
      </div>

      {summary.pendingUserCount > 0 && (
        <div className="bg-primary/15 border-l-4 border-primary p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Users className="text-primary h-6 w-6" />
            <div>
              <p className="font-bold text-foreground">Menunggu Persetujuan</p>
              <p className="text-muted-foreground text-sm font-medium">{summary.pendingUserCount} pengguna menunggu akses role.</p>
            </div>
          </div>
          <Link href="/users" className="bg-primary text-white text-xs font-bold uppercase tracking-wider px-4 py-2 hover:bg-primary/90 transition-colors shadow-sm">
            Tinjau
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Link key={card.label} href={card.href} className="block group">
            <div className="bg-card border border-border p-6 shadow-sm hover:shadow-md transition-all group-hover:border-primary/50 relative overflow-hidden">
              <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <card.icon className="h-24 w-24 -mr-6 -mt-6" strokeWidth={1.5} />
              </div>
              <div className="relative z-10 flex flex-col gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{card.label}</p>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-mono font-bold text-foreground">{card.value}</p>
                  <ArrowRight className="h-5 w-5 text-primary opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all mb-1" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-card border border-border shadow-sm">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Aktivitas Terakhir
          </h2>
          <Link href="/audit-log" className="text-sm font-bold text-primary hover:underline">Lihat Semua</Link>
        </div>
        
        {summary.recentAuditEntries.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground font-medium">
            Tidak ada aktivitas terbaru.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {summary.recentAuditEntries.map((entry) => (
              <div key={entry.id} className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between hover:bg-secondary/30 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5
                      ${entry.action === 'create' ? 'bg-primary/20 text-foreground border border-primary/40' :
                        entry.action === 'update' ? 'bg-secondary text-secondary-foreground border border-border' :
                        'bg-foreground/10 text-foreground border border-border'
                      }
                    `}>
                      {entry.action}
                    </span>
                    <span className="font-mono text-sm font-semibold">{entry.entityType} <span className="text-muted-foreground font-normal">#{entry.entityId}</span></span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    by <span className="font-bold text-foreground">{entry.actorName || "Unknown User"}</span>
                  </p>
                </div>
                <div className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.createdAt), "MMM d, HH:mm")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
