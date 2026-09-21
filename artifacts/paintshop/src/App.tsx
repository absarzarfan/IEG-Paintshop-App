import { type ReactNode, useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

import { Layout } from './components/layout';
import { Landing } from './pages/landing';
import { Dashboard } from './pages/dashboard';
import { JobItems } from './pages/job-items';
import { JobItemDetail } from './pages/job-items/detail';
import { Materials } from './pages/materials';
import { Colors } from './pages/colors';
import { Brands } from './pages/brands';
import { Users } from './pages/users';
import { AuditLog } from './pages/audit-log';
import { PaintUsage } from './pages/paint-usage';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(24 98% 48%)", // Safety Orange
    colorForeground: "hsl(240 10% 4%)", 
    colorMutedForeground: "hsl(240 4% 46%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)", 
    colorInputForeground: "hsl(240 10% 4%)",
    colorNeutral: "hsl(240 6% 90%)",
    fontFamily: "'Manrope', system-ui, sans-serif",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded border border-border shadow-xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-bold font-sans",
    headerSubtitle: "text-muted-foreground font-sans",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-semibold",
    footerActionLink: "text-primary font-bold hover:underline",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:bg-primary/10",
    formFieldSuccessText: "text-green-600",
    alertText: "text-foreground",
    logoBox: "h-12 flex justify-center",
    logoImage: "h-full w-auto",
    socialButtonsBlockButton: "border-border hover:bg-secondary transition-colors",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-wide",
    formFieldInput: "border-border bg-white text-foreground focus:border-primary focus:ring-primary",
    footerAction: "bg-secondary/30",
    dividerLine: "bg-border",
    alert: "bg-red-50 border border-red-200",
    otpCodeFieldInput: "border-border focus:border-primary focus:ring-primary",
    formFieldRow: "mb-4",
    main: "p-8",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative">
      {/* Decorative background element */}
      <div className="absolute inset-0 z-0 bg-[url('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-5" />
      <div className="relative z-10">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative">
      <div className="absolute inset-0 z-0 bg-[url('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-5" />
      <div className="relative z-10">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component, path }: { component: React.ComponentType, path: string }) {
  return (
    <Route path={path}>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </Route>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Access Control",
            subtitle: "Sign in to the IEG Paintshop System",
          },
        },
        signUp: {
          start: {
            title: "Request Access",
            subtitle: "Register for an operator account",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            
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
            
            {/* Fallback route */}
            <Route>
              <Layout>
                <NotFound />
              </Layout>
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
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
        <ClerkProviderWithRoutes />
      </RoutedErrorBoundary>
    </WouterRouter>
  );
}

export default App;
