import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "sonner";
import Auth from "./pages/Auth";
import MapView from "./pages/MapView";
import Portfolio from "./pages/Portfolio";
import SiteDetail from "./pages/SiteDetail";
import Admin from "./pages/Admin";
import LaProgramme from "./pages/LaProgramme";
import QuickEstimate from "./pages/QuickEstimate";
import Training from "./pages/Training";
import Studies from "./pages/Studies";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

/** Catches unhandled promise rejections globally so they don't crash the app */
function GlobalErrorCatcher({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault();
      toast.error("An unexpected error occurred. Your work is safe — please try again.");
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<AuthRoute />} />
    <Route path="/quick-estimate" element={<QuickEstimate />} />
    <Route path="/" element={<ProtectedRoute><MapView /></ProtectedRoute>} />
    <Route path="/portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
    <Route path="/site/:id" element={<ProtectedRoute><SiteDetail /></ProtectedRoute>} />
    <Route path="/la-programme" element={<ProtectedRoute><LaProgramme /></ProtectedRoute>} />
    <Route path="/studies" element={<ProtectedRoute><Studies /></ProtectedRoute>} />
    <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <ErrorBoundary>
    <GlobalErrorCatcher>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </GlobalErrorCatcher>
  </ErrorBoundary>
);

export default App;
