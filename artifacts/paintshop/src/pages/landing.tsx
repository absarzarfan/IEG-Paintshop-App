import { Link } from "wouter";
import { ArrowRight, ClipboardPenLine, PackageCheck, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/lib/language";

export function Landing() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col font-sans selection:bg-primary selection:text-primary-foreground">
      <header className="h-20 bg-sidebar flex items-center justify-between px-6 lg:px-12">
        <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-white.png`} alt="Integrated Engineering Group" className="h-9 w-auto max-w-[190px] object-contain" />
        <div className="flex items-center gap-4">
          <div className="inline-flex border border-sidebar-border" aria-label={t("language")}>
            <button type="button" onClick={() => setLanguage("id")} aria-pressed={language === "id"} className={`px-2 py-1 text-xs font-bold ${language === "id" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/75"}`} data-testid="button-language-id-landing">ID</button>
            <button type="button" onClick={() => setLanguage("en")} aria-pressed={language === "en"} className={`px-2 py-1 text-xs font-bold ${language === "en" ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/75"}`} data-testid="button-language-en-landing">EN</button>
          </div>
          <Link href="/sign-in" className="text-xs font-bold uppercase tracking-[0.16em] text-sidebar-foreground transition-colors hover:text-primary">{t("signIn")}</Link>
        </div>
      </header>

        <main className="flex-1 flex flex-col items-center px-5 py-14 text-center">
        <div className="max-w-5xl w-full">
           <div className="mx-auto mb-8 flex h-24 w-56 items-center justify-center border border-border bg-card shadow-sm">
            <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-navy.png`} alt="Integrated Engineering Group" className="h-16 w-auto max-w-[190px] object-contain" />
          </div>

           <div className="mx-auto mb-4 inline-flex items-center gap-2 border border-primary/40 bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">
             <span className="h-2 w-2 bg-primary" />
              {t("landingEyebrow")}
           </div>
           <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight uppercase">
            IEG Paintshop
          </h1>
           <p className="mt-3 text-sm sm:text-base font-medium text-muted-foreground">
             {t("authSystemDesc")}
          </p>

          <div className="mt-12 grid grid-cols-1 gap-4 text-left md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                eyebrow: t("systemControl"),
                title: t("roleAdminShort"),
                description: t("landingAdmin"),
              },
              {
                icon: ClipboardPenLine,
                eyebrow: t("paintOperation"),
                title: t("rolePainterShort"),
                description: t("landingMixer"),
              },
              {
                icon: PackageCheck,
                eyebrow: t("materialControl"),
                title: t("roleWarehouseShort"),
                description: t("landingWarehouse"),
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
                   {t("continueSignIn")}
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
