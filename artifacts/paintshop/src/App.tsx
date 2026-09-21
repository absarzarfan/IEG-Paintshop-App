import { type FormEvent, type ReactNode, useState } from "react";
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from "wouter";
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
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 relative">
      <div className="absolute inset-0 z-0 bg-[url('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-5" />
      <div className="relative z-10 w-full max-w-md bg-card border border-border shadow-xl">
        <div className="border-b border-border p-8 pb-6 text-center">
          <img
            src={`${import.meta.env.BASE_URL.replace(/\/$/, "") || ""}/logo.svg`}
            alt="IEG Paintshop"
            className="h-10 w-auto mx-auto mb-6"
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            {statusLoading ? "Access Control" : isSetup ? "Buat Admin Pertama" : "Masuk ke Sistem"}
          </h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {isSetup
              ? "Siapkan akun Admin. Setelah ini, hanya Admin yang dapat membuat akun pengguna."
              : "Gunakan username dan password yang diberikan oleh Admin."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
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
            {isSetup && <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>}
          </div>
          <Button type="submit" className="w-full h-11 font-bold uppercase tracking-wide" disabled={isSubmitting || statusLoading || !!statusError}>
            {isSubmitting ? "Memproses..." : isSetup ? "Buat Admin & Masuk" : "Masuk"}
          </Button>
        </form>

        <div className="border-t border-border px-8 py-4 text-center text-xs font-medium text-muted-foreground">
          Akses dibuat dan dikelola oleh Administrator IEG.
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