import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PublicAttendance = lazy(() => import("./pages/PublicAttendance"));
const BlockedAccess = lazy(() => import("./pages/BlockedAccess"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: 5 * 60 * 1000,
    },
  },
});

export function RouteLoading() {
  return (
    <div
      data-ui-surface="ta"
      role="status"
      aria-label="Loading portal"
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-10"
    >
      <div className="matte-grain" />
      <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl neo-in">
        <Loader2 aria-hidden="true" className="h-10 w-10 animate-spin text-debossed-sm status-all-text" />
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isTA } = useAuth();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if email ends with @khi.iba.edu.pk OR user is a TA
  const isIBAEmail = user.email?.endsWith('@khi.iba.edu.pk');
  if (!isIBAEmail && !isTA) {
    return <BlockedAccess />;
  }

  return <>{children}</>;
}

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => (
  <Suspense fallback={<RouteLoading />}>
    <Routes>
      <Route path="/" element={<PublicRoute><PublicAttendance /></PublicRoute>} />
      <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
