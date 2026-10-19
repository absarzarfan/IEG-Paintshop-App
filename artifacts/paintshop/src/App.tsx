import { type FormEvent, type ReactNode, useState } from "react";
import { Link, Route, Switch, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  useGetAuthStatus,
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useLogin,
  useSetupAdmin,
} from "@workspace/api-client-react";

import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";

import { Layout } from "./components/layout";
import { Landing } from "./pages/landing";
import { Dashboard } from "./pages/dashboard";
import { JobItems } from "./pages/job-items";
import { JobItemDetail } from "./pages/job-items/detail";
import { Materials } from "./pages/materials";
import { Colors } from "./pages/colors";
import { Brands } from "./pages/brands";
import { Users } from "./pages/users";
import { AuditLog } from "./pages/audit-log";
import { PaintUsage } from "./pages/paint-usage";
import { Stock } from "./pages/stock";
import { Ongoing } from "./pages/ongoing";
import { Shipment } from "./pages/shipment";
import { LanguageProvider } from "./lib/language";
import { useLanguage } from "./lib/language";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoadingScreen() {
  const { t } = useLanguage();
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <div className="w-full max-w-xs space-y-3 px-6">
        <div className="h-2 w-2/3 animate-pulse bg-muted" />
        <div className="h-2 w-full animate-pulse bg-muted" />
        <div className="h-2 w-1/2 animate-pulse bg-muted" />
    <p className="pt-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{t("loadingSystem")}</p>
      </div>
    </div>
  );
}

function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function AuthPage() {
  const { language, setLanguage, t } = useLanguage();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: status, isLoading: statusLoading, error: statusError } = useGetAuthStatus();
  const loginMutation = useLogin();
  const setupMutation = useSetupAdmin();
  const [username, setUsername] = useState("Admin");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const isSetup = status?.setupRequired === true;
  const isSubmitting = loginMutation.isPending || setupMutation.isPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (isSetup) {
        await setupMutation.mutateAsync({ data: { username, password, name } });
      } else {
        await loginMutation.mutateAsync({ data: { username, password } });
      }
      await queryClient.invalidateQueries();
      setLocation("/dashboard");
    } catch {
      // The mutation error is rendered below.
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <img
            src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-navy.png`}
            alt="Integrated Engineering Group"
            className="mx-auto h-16 w-auto max-w-[220px] object-contain"
          />
          <h1 className="mt-6 text-3xl font-extrabold uppercase tracking-tight text-foreground">
            IEG Paintshop
          </h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{t("authSystemDesc")}</p>
        </div>

        <div className="rounded-lg border border-card-border bg-card p-6 shadow-lg sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><span aria-hidden="true">←</span>{t("backHome")}</Link>
            <div className="inline-flex border border-border" aria-label="Language">
              <button type="button" onClick={() => setLanguage("id")} aria-pressed={language === "id"} className={`px-2 py-1 text-xs font-bold ${language === "id" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} data-testid="button-language-id-auth">ID</button>
              <button type="button" onClick={() => setLanguage("en")} aria-pressed={language === "en"} className={`px-2 py-1 text-xs font-bold ${language === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} data-testid="button-language-en-auth">EN</button>
            </div>
          </div>
          <div className="mt-6">
            <h2 className="text-2xl font-bold text-foreground">
              {statusLoading ? t("authAccess") : isSetup ? t("createFirstAdmin") : t("signIn")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isSetup
                ? t("authSetupHelp")
                : t("authSignInHelp")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            {statusError && (
              <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {t("authServerError")}
              </div>
            )}
            {(loginMutation.error || setupMutation.error) && (
              <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {authErrorMessage(loginMutation.error || setupMutation.error, t("genericAuthError"))}
              </div>
            )}

            {isSetup && (
              <div className="space-y-2">
                <Label htmlFor="name">{t("fullName")}</Label>
                <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                minLength={isSetup ? 3 : 1}
                autoComplete="username"
                placeholder={t("usernamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
               minLength={4}
                autoComplete={isSetup ? "new-password" : "current-password"}
              />
               <p className="text-xs text-muted-foreground">{t("minimumPassword")}</p>
            </div>
            <Button type="submit" className="h-11 w-full font-bold uppercase tracking-wide" disabled={isSubmitting || statusLoading || !!statusError}>
              {isSubmitting ? t("processing") : isSetup ? t("createAdminSignIn") : t("signIn")}
            </Button>
          </form>

          <div className="mt-6 border-t border-border pt-4 text-center text-xs font-medium text-muted-foreground">
             {t("authFooter")}
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeRedirect() {
  const { data: user, isLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  if (isLoading) return <LoadingScreen />;
  return user ? <Redirect to="/dashboard" /> : <Landing />;
}

function ProtectedRoute({ component: Component, path, allowedRoles }: { component: React.ComponentType, path: string, allowedRoles?: string[] }) {
  const { data: user, isLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  return (
    <Route path={path}>
      {isLoading ? <LoadingScreen /> : user ? (
        allowedRoles && !allowedRoles.includes(user.role) ? <Redirect to="/dashboard" /> : <Layout><Component /></Layout>
      ) : <Redirect to="/sign-in" />}
    </Route>
  );
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
      <TooltipProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in" component={AuthPage} />

          <ProtectedRoute path="/dashboard" component={Dashboard} />
          <ProtectedRoute path="/ongoing" component={Ongoing} allowedRoles={["admin", "painter", "warehouse"]} />
          <ProtectedRoute path="/shipment" component={Shipment} allowedRoles={["admin", "painter", "warehouse"]} />
          <ProtectedRoute path="/job-items" component={JobItems} allowedRoles={["admin", "painter", "warehouse"]} />
          <ProtectedRoute path="/job-items/:id" component={JobItemDetail} allowedRoles={["admin", "painter", "warehouse"]} />
          <ProtectedRoute path="/paint-usage" component={PaintUsage} />
          <ProtectedRoute path="/paint-usage/:id" component={PaintUsage} />
          <ProtectedRoute path="/stock" component={Stock} allowedRoles={["admin", "painter", "warehouse"]} />
          <ProtectedRoute path="/materials" component={Materials} allowedRoles={["admin", "painter", "warehouse"]} />
          <ProtectedRoute path="/colors" component={Colors} allowedRoles={["admin", "painter", "warehouse"]} />
          <ProtectedRoute path="/brands" component={Brands} allowedRoles={["admin", "painter", "warehouse"]} />
          <ProtectedRoute path="/users" component={Users} allowedRoles={["admin"]} />
          <ProtectedRoute path="/audit-log" component={AuditLog} allowedRoles={["admin"]} />

          <Route>
            <Layout><NotFound /></Layout>
          </Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <RoutedErrorBoundary>
        <AppRoutes />
      </RoutedErrorBoundary>
    </WouterRouter>
  );
}

export default App;