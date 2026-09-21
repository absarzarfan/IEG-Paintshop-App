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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoadingScreen() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Memuat...</div>
    </div>
  );
}

function authErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Tidak dapat memproses permintaan. Silakan coba lagi.";
}

function AuthPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: status, isLoading: statusLoading, error: statusError } = useGetAuthStatus();
  const loginMutation = useLogin();
  const setupMutation = useSetupAdmin();
  const [username, setUsername] = useState("");
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
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#f4f5f7] px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <img
            src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo-ieg-navy.png`}
            alt="Integrated Engineering Group"
            className="mx-auto h-16 w-auto max-w-[220px] object-contain"
          />
          <h1 className="mt-6 text-3xl font-extrabold uppercase tracking-tight text-[#41444B]">
            IEG Paintshop
          </h1>
          <p className="mt-2 font-mono text-xs text-[#6b7078]">Paint usage and material control system</p>
        </div>

        <div className="rounded-xl border border-[#e0e2e5] bg-white p-6 shadow-[0_16px_35px_rgba(65,68,75,0.12)] sm:p-8">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-[#6b7078] hover:text-[#41444B]">
            <span aria-hidden="true">←</span>
            Pilih halaman utama
          </Link>
          <div className="mt-6">
            <h2 className="text-2xl font-bold text-[#41444B]">
              {statusLoading ? "Access Control" : isSetup ? "Buat Admin Pertama" : "Masuk ke Sistem"}
            </h2>
            <p className="mt-2 text-sm text-[#6b7078]">
              {isSetup
                ? "Siapkan akun Admin. Setelah ini, hanya Admin yang dapat membuat akun pengguna."
                : "Gunakan username dan password yang diberikan oleh Admin."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            {statusError && (
              <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                Server autentikasi belum siap. Silakan muat ulang halaman.
              </div>
            )}
            {(loginMutation.error || setupMutation.error) && (
              <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {authErrorMessage(loginMutation.error || setupMutation.error)}
              </div>
            )}

            {isSetup && (
              <div className="space-y-2">
                <Label htmlFor="name">Nama lengkap</Label>
                <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                minLength={isSetup ? 3 : 1}
                autoComplete="username"
                placeholder="contoh: operator.batam"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={isSetup ? 8 : 1}
                autoComplete={isSetup ? "new-password" : "current-password"}
              />
              {isSetup && <p className="text-xs text-[#6b7078]">Minimal 8 karakter.</p>}
            </div>
            <Button type="submit" className="h-11 w-full bg-[#FDDB3A] font-bold uppercase tracking-wide text-[#41444B] hover:bg-[#f2cc27]" disabled={isSubmitting || statusLoading || !!statusError}>
              {isSubmitting ? "Memproses..." : isSetup ? "Buat Admin & Masuk" : "Masuk"}
            </Button>
          </form>

          <div className="mt-6 border-t border-[#e6e7e9] pt-4 text-center text-xs font-medium text-[#858a92]">
            Akses dibuat dan dikelola oleh Administrator IEG.
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

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType, path: string }) {
  const { data: user, isLoading } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  return (
    <Route path={path}>
      {isLoading ? <LoadingScreen /> : user ? <Layout><Component /></Layout> : <Redirect to="/sign-in" />}
    </Route>
  );
}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in" component={AuthPage} />

          <ProtectedRoute path="/dashboard" component={Dashboard} />
          <ProtectedRoute path="/job-items" component={JobItems} />
          <ProtectedRoute path="/job-items/:id" component={JobItemDetail} />
          <ProtectedRoute path="/paint-usage" component={PaintUsage} />
          <ProtectedRoute path="/paint-usage/:id" component={PaintUsage} />
          <ProtectedRoute path="/materials" component={Materials} />
          <ProtectedRoute path="/colors" component={Colors} />
          <ProtectedRoute path="/brands" component={Brands} />
          <ProtectedRoute path="/users" component={Users} />
          <ProtectedRoute path="/audit-log" component={AuditLog} />

          <Route>
            <Layout><NotFound /></Layout>
          </Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
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