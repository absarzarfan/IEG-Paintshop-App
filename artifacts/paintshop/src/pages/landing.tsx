import { Link } from "wouter";
import { ArrowRight, Factory, HardHat, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary selection:text-white">
      <header className="h-20 border-b border-border bg-card flex items-center px-6 lg:px-12 justify-between">
        <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo.svg`} alt="IEG Paintshop" className="h-8" />
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-bold text-foreground hover:text-primary transition-colors uppercase tracking-wide">
            Log In
          </Link>
          <Link href="/sign-up" className="hidden sm:inline-flex bg-primary text-primary-foreground h-9 px-4 items-center justify-center font-bold text-sm uppercase tracking-wide hover:bg-primary/90 transition-colors shadow-sm">
            Request Access
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        {/* Background elements */}
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px] opacity-30 z-0"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent z-0"></div>

        <div className="max-w-3xl z-10 space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-secondary border border-border text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
            <Factory size={14} className="text-primary" />
            PT IEG Manufacturing Indonesia
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-extrabold text-foreground tracking-tight leading-[1.1]">
            SYSTEM OF RECORD FOR <span className="text-primary">PAINTSHOP</span> OPERATIONS.
          </h1>
          
          <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto">
            Replace paper tracking with authoritative master data. Manage job items, material consumption targets, and strict role-based access for the Batam fabrication plant.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/sign-in" className="w-full sm:w-auto h-12 px-8 bg-foreground text-background flex items-center justify-center font-bold text-base uppercase tracking-wide hover:bg-foreground/90 transition-all shadow-md group">
              Sign In to System
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl z-10 text-left">
          <div className="bg-card p-6 border border-border shadow-sm">
            <HardHat className="h-8 w-8 text-primary mb-4" strokeWidth={2} />
            <h3 className="font-bold text-lg mb-2">Master Data Control</h3>
            <p className="text-muted-foreground text-sm font-medium">Precise tracking of paint targets per unit, serial numbers, and overconsumption thresholds.</p>
          </div>
          <div className="bg-card p-6 border border-border shadow-sm">
            <ShieldCheck className="h-8 w-8 text-primary mb-4" strokeWidth={2} />
            <h3 className="font-bold text-lg mb-2">Role-Based Access</h3>
            <p className="text-muted-foreground text-sm font-medium">Strict boundaries between Admins, Painters, Warehouse, Supervisors, and Procurement.</p>
          </div>
          <div className="bg-card p-6 border border-border shadow-sm">
            <Factory className="h-8 w-8 text-primary mb-4" strokeWidth={2} />
            <h3 className="font-bold text-lg mb-2">Audit Trail</h3>
            <p className="text-muted-foreground text-sm font-medium">Append-only history of every change. Know exactly who updated prices or material links.</p>
          </div>
        </div>
      </main>
      
      <footer className="h-16 border-t border-border bg-card flex items-center justify-center px-6 z-10 text-xs font-mono text-muted-foreground uppercase tracking-widest">
        © {new Date().getFullYear()} PT IEG Manufacturing Indonesia
      </footer>
    </div>
  );
}
