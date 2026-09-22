import { ReactNode, useEffect, useState } from "react";
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
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X
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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileSidebarOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileSidebarOpen]);

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
      {isMobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col bg-sidebar border-r border-sidebar-border shadow-2xl transition-[transform,width] duration-200 ease-out md:relative md:z-auto md:max-w-none md:translate-x-0 md:shadow-none ${
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
      } ${isSidebarCollapsed ? "md:w-[4.5rem]" : "md:w-64"}`}>
        <div className={`h-16 flex shrink-0 items-center border-b border-sidebar-border bg-sidebar ${
          isSidebarCollapsed ? "md:justify-center md:px-2" : "justify-between px-5"
        }`}>
          <img
            src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-white.png`}
            alt="Integrated Engineering Group"
            className={`h-9 w-auto object-contain opacity-95 ${isSidebarCollapsed ? "md:max-w-9" : "max-w-[180px]"}`}
          />
          <button
            type="button"
            aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            title={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            className="hidden h-9 w-9 shrink-0 items-center justify-center border border-sidebar-border text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:inline-flex"
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            type="button"
            aria-label="Close navigation"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        
        <div className={`border-b border-sidebar-border ${isSidebarCollapsed ? "p-3 md:flex md:justify-center" : "p-4"} ${isAdmin ? "admin-identity" : "bg-sidebar-accent/20"}`}>
          <div className={isSidebarCollapsed ? "md:hidden" : ""}>
            <div className="flex items-start justify-between gap-3">
              <p className="truncate text-sm font-bold text-sidebar-foreground" title={user?.name || user?.username || "User"}>
                {user?.name || user?.username || "User"}
              </p>
              {isAdmin && <ShieldCheck size={18} className="shrink-0 text-primary" strokeWidth={2.5} />}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary"></span>
              <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                {user ? ROLE_LABELS[user.role] : "Loading..."}
              </p>
            </div>
            <p className={`mt-3 text-[10px] font-bold uppercase tracking-[0.16em] ${isAdmin ? "text-primary" : "text-sidebar-foreground/50"}`}>
              {isAdmin ? "Admin Control · Full Access" : "Operational Access"}
            </p>
          </div>
          {isSidebarCollapsed && (
            <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-foreground md:flex" title={user?.name || user?.username || "User"}>
              {(user?.name || user?.username || "U").charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto py-4 ${isSidebarCollapsed ? "px-2" : "px-3"} space-y-1`}>
          <div className={`mb-2 px-3 ${isSidebarCollapsed ? "md:hidden" : ""}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/40">Master Data</p>
          </div>
          {navLinks.map((link) => {
            const isActive = location === link.href || location.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} aria-current={isActive ? "page" : undefined} title={isSidebarCollapsed ? link.name : undefined} className={`flex items-center gap-3 border-l-2 py-2.5 text-sm transition-colors ${isSidebarCollapsed ? "justify-center px-2" : "px-3"} ${isActive ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground font-bold" : "border-transparent text-sidebar-foreground/80 hover:border-sidebar-primary/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                <link.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                <span className={isSidebarCollapsed ? "md:hidden" : ""}>{link.name}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className={`mt-8 mb-2 px-3 ${isSidebarCollapsed ? "md:hidden" : ""}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Admin Control</p>
              </div>
              {adminLinks.map((link) => {
                const isActive = location === link.href;
                return (
                  <Link key={link.href} href={link.href} aria-current={isActive ? "page" : undefined} title={isSidebarCollapsed ? link.name : undefined} className={`flex items-center gap-3 border-l-2 py-2.5 text-sm transition-colors ${isSidebarCollapsed ? "justify-center px-2" : "px-3"} ${isActive ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground font-bold" : "border-transparent text-sidebar-foreground/80 hover:border-sidebar-primary/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                    <link.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    <span className={isSidebarCollapsed ? "md:hidden" : ""}>{link.name}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className={`border-t border-sidebar-border ${isSidebarCollapsed ? "p-2 md:flex md:justify-center" : "p-4"}`}>
          <button 
            type="button"
            title={isSidebarCollapsed ? "Log Keluar" : undefined}
            className={`flex w-full items-center gap-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${isSidebarCollapsed ? "justify-center px-2 md:w-10" : "px-3"}`}
            onClick={handleLogout}
          >
            <LogOut size={18} />
            <span className={isSidebarCollapsed ? "md:hidden" : ""}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header (hidden on desktop) */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-3 sm:h-16 sm:px-4 md:hidden">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-white.png`} alt="Integrated Engineering Group" className="h-9 w-auto max-w-[180px] object-contain" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            aria-expanded={isMobileSidebarOpen}
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => setIsMobileSidebarOpen(true)}
          >
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
          <div className="p-3 sm:p-5 lg:p-8">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}
