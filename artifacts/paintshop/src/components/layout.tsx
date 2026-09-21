import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  PaintBucket, 
  Droplet, 
  Palette, 
  Settings, 
  Users,
  Activity,
  LogOut,
  ShieldAlert,
  Menu
} from "lucide-react";
import { ClipboardPenLine } from "lucide-react";
import { useAppAuth, ROLE_LABELS } from "@/lib/auth";
import { Button } from "./ui/button";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isPending, isAdmin } = useAppAuth();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    queryClient.clear();
    setLocation("/");
  };

  // Handle pending users
  if (isPending) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-primary/20 text-primary mx-auto flex items-center justify-center">
            <ShieldAlert size={32} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-sans text-foreground">Menunggu Persetujuan</h1>
            <p className="text-muted-foreground mt-2 font-medium">
              Akun Anda sedang dalam antrean. Hubungi Administrator untuk mendapatkan akses.
            </p>
          </div>
          <div className="bg-secondary p-4 text-left border-l-4 border-primary">
            <p className="text-sm font-semibold text-foreground uppercase tracking-wide">Detail Akun</p>
            <div className="mt-2 space-y-1 text-sm">
              <p><span className="text-muted-foreground">Username:</span> <span className="font-mono">{user?.username}</span></p>
              <p><span className="text-muted-foreground">Status:</span> <span className="font-bold text-primary">Pending</span></p>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full uppercase font-bold tracking-wide"
            onClick={handleLogout}
          >
            Log Out
          </Button>
        </div>
      </div>
    );
  }

  const navLinks = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Job Items", href: "/job-items", icon: PaintBucket },
    { name: "Paint Usage", href: "/paint-usage", icon: ClipboardPenLine },
    { name: "Materials", href: "/materials", icon: Droplet },
    { name: "Colors", href: "/colors", icon: Palette },
    { name: "Brands", href: "/brands", icon: Settings },
  ];

  const adminLinks = [
    { name: "Users", href: "/users", icon: Users },
    { name: "Audit Log", href: "/audit-log", icon: Activity },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar-accent/50">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-white.png`} alt="Integrated Engineering Group" className="h-9 w-auto max-w-[180px] object-contain opacity-95" />
        </div>
        
        <div className="p-4 border-b border-sidebar-border bg-sidebar-accent/20">
          <p className="text-sm font-bold text-sidebar-foreground truncate" title={user?.name || user?.username || "User"}>
            {user?.name || user?.username || "User"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <p className="text-xs font-mono text-sidebar-foreground/70 uppercase">
              {user ? ROLE_LABELS[user.role] : "Loading..."}
            </p>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 mb-2">
            <p className="text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest">Master Data</p>
          </div>
          {navLinks.map((link) => {
            const isActive = location === link.href || location.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground font-bold" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                <link.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {link.name}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="px-3 mt-8 mb-2">
                <p className="text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest">Administrasi</p>
              </div>
              {adminLinks.map((link) => {
                const isActive = location === link.href;
                return (
                  <Link key={link.href} href={link.href} className={`flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground font-bold" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
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
        <header className="h-16 md:hidden border-b border-[#52575D] bg-[#41444B] flex items-center px-4 justify-between shrink-0">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-white.png`} alt="Integrated Engineering Group" className="h-9 w-auto max-w-[180px] object-contain" />
          <Button variant="ghost" size="icon" className="text-[#F6F4E6] hover:bg-[#52575D] hover:text-[#F6F4E6]">
            <Menu className="h-5 w-5" />
          </Button>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-background p-6 lg:p-8">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
