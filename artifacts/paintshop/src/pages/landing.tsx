import { Link } from "wouter";
import { ArrowRight, ClipboardPenLine, PackageCheck, ShieldCheck } from "lucide-react";

export function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col font-sans selection:bg-primary selection:text-primary-foreground">
      <header className="h-20 bg-sidebar flex items-center justify-between px-6 lg:px-12">
        <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-white.png`} alt="Integrated Engineering Group" className="h-9 w-auto max-w-[190px] object-contain" />
        <Link href="/sign-in" className="text-xs font-bold uppercase tracking-[0.16em] text-sidebar-foreground transition-colors hover:text-primary">
           Sign In
        </Link>
      </header>

        <main className="flex-1 flex flex-col items-center px-5 py-14 text-center">
        <div className="max-w-5xl w-full">
           <div className="mx-auto mb-8 flex h-24 w-56 items-center justify-center border border-border bg-card shadow-sm">
            <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-navy.png`} alt="Integrated Engineering Group" className="h-16 w-auto max-w-[190px] object-contain" />
          </div>

           <div className="mx-auto mb-4 inline-flex items-center gap-2 border border-primary/40 bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">
             <span className="h-2 w-2 bg-primary" />
             Internal operations console
           </div>
           <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight uppercase">
            IEG Paintshop
          </h1>
           <p className="mt-3 text-sm sm:text-base font-medium text-muted-foreground">
            Paint usage and material control system
          </p>

          <div className="mt-12 grid grid-cols-1 gap-4 text-left md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                eyebrow: "System Control",
                title: "Admin",
                description: "Manage users, roles, master data, and the complete Paintshop operation.",
              },
              {
                icon: ClipboardPenLine,
                eyebrow: "Paint Operation",
                title: "Paint Mixer",
                description: "Record actual primer and topcoat usage for every job and serial number.",
              },
              {
                icon: PackageCheck,
                eyebrow: "Material Control",
                title: "Warehouse",
                description: "Monitor paint materials, stock thresholds, batches, and expiry dates.",
              },
            ].map(({ icon: Icon, eyebrow, title, description }) => (
              <Link
                key={title}
                href="/sign-in"
                 className="group min-h-56 border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center bg-primary text-primary-foreground">
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </div>
                   <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                </div>
                <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
                 <h2 className="mt-2 text-lg font-extrabold text-foreground">{title}</h2>
                 <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p>
                 <div className="mt-5 border-t border-border pt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Continue to sign in
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

       <footer className="border-t border-border bg-card px-6 py-5 text-center text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
        © {new Date().getFullYear()} PT IEG Manufacturing Indonesia
      </footer>
    </div>
  );
}
