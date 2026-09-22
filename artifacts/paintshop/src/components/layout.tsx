import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  PaintBucket, 
  Droplet, 
  Boxes,
  Palette, 
  Settings, 
  Users,
  Activity,
  LogOut,
  ShieldCheck,
  Menu
} from "lucide-react";
import { ClipboardPenLine } from "lucide-react";
import { useAppAuth, ROLE_LABELS } from "@/lib/auth";
import { Button } from "./ui/button";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isAdmin } = useAppAuth();
  const canTraceStock = user?.role === "admin" || user?.role === "warehouse";
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    queryClient.clear();
    setLocation("/");
  };

  const navLinks = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Job Items", href: "/job-items", icon: PaintBucket },
    { name: "Paint Usage", href: "/paint-usage", icon: ClipboardPenLine },
    ...(canTraceStock ? [{ name: "Stock", href: "/stock", icon: Boxes }] : []),
    { name: "Materials", href: "/materials", icon: Droplet },
    { name: "Colors", href: "/colors", icon: Palette },
    { name: "Brands", href: "/brands", icon: Settings },
  ];

  const adminLinks = [
    { name: "Users", href: "/users", icon: Users },
    { name: "Audit Log", href: "/audit-log", icon: Activity },
  ];

  return (
      <div className="min-h-[100dvh] flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-white.png`} alt="Integrated Engineering Group" className="h-9 w-auto max-w-[180px] object-contain opacity-95" />
        </div>
        
        <div className={`p-4 border-b border-sidebar-border ${isAdmin ? "admin-identity" : "bg-sidebar-accent/20"}`}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-sidebar-foreground truncate" title={user?.name || user?.username || "User"}>
            {user?.name || user?.username || "User"}
            </p>
            {isAdmin && <ShieldCheck size={18} className="shrink-0 text-primary" strokeWidth={2.5} />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <p className="text-[11px] font-mono font-semibold text-sidebar-foreground/70 uppercase tracking-wider">
              {user ? ROLE_LABELS[user.role] : "Loading..."}
            </p>
          </div>
          <p className={`mt-3 text-[10px] font-bold uppercase tracking-[0.16em] ${isAdmin ? "text-primary" : "text-sidebar-foreground/50"}`}>
            {isAdmin ? "Admin Control · Full Access" : "Operational Access"}
          </p>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 mb-2">
            <p className="text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest">Master Data</p>
          </div>
          {navLinks.map((link) => {
            const isActive = location === link.href || location.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} aria-current={isActive ? "page" : undefined} className={`flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors ${isActive ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground font-bold" : "border-transparent text-sidebar-foreground/80 hover:border-sidebar-primary/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                <link.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {link.name}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="px-3 mt-8 mb-2">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Admin Control</p>
              </div>
              {adminLinks.map((link) => {
                const isActive = location === link.href;
                return (
                  <Link key={link.href} href={link.href} aria-current={isActive ? "page" : undefined} className={`flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition-colors ${isActive ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground font-bold" : "border-transparent text-sidebar-foreground/80 hover:border-sidebar-primary/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                    <link.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    {link.name}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <button 
            type="button"
            className="flex items-center gap-3 px-3 py-2 w-full text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            Log Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header (hidden on desktop) */}
        <header className="h-16 md:hidden border-b border-sidebar-border bg-sidebar flex items-center px-4 justify-between shrink-0">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-white.png`} alt="Integrated Engineering Group" className="h-9 w-auto max-w-[180px] object-contain" />
          <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <Menu className="h-5 w-5" />
          </Button>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-background">
          <div className="console-topbar hidden h-14 items-center justify-between border-b border-sidebar-border px-6 lg:flex lg:px-8">
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em]">
              <span className="text-primary">IEG</span>
              <span className="text-sidebar-foreground/45">/</span>
              <span>Paintshop Control</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-sidebar-foreground/60">{user?.name || user?.username}</span>
              <span className="border border-sidebar-primary/50 bg-sidebar-primary px-2 py-1 font-bold uppercase tracking-wider text-sidebar-primary-foreground">
                {user ? ROLE_LABELS[user.role] : "Loading"}
              </span>
            </div>
          </div>
          <div className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}
