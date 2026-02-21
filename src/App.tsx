import { useEffect, lazy, Suspense, useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Auth from "./pages/Auth";
import CompleteProfile from "./pages/CompleteProfile";
import PendingApproval from "./pages/PendingApproval";

const MapView = lazy(() => import("./pages/MapView"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const SiteDetail = lazy(() => import("./pages/SiteDetail"));
const Admin = lazy(() => import("./pages/Admin"));
const LaProgramme = lazy(() => import("./pages/LaProgramme"));
const QuickEstimate = lazy(() => import("./pages/QuickEstimate"));
const Training = lazy(() => import("./pages/Training"));
const Studies = lazy(() => import("./pages/Studies"));
const StudyDetail = lazy(() => import("./pages/StudyDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [profileState, setProfileState] = useState<"loading" | "complete" | "incomplete" | "pending_approval">("loading");

  const checkProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, company, phone, is_approved")
      .eq("user_id", user.id)
      .single();

    if (!data) {
      setProfileState("incomplete");
      return;
    }

    if (!data.is_approved) {
      setProfileState("pending_approval");
      return;
    }

    if (!data.full_name || !data.company || !data.phone) {
      setProfileState("incomplete");
      return;
    }

    setProfileState("complete");
  }, [user]);

  useEffect(() => {
    if (!loading && user) {
      checkProfile();
    } else if (!loading && !user) {
      setProfileState("loading");
    }
  }, [loading, user, checkProfile]);

  if (loading || (user && profileState === "loading"))
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (profileState === "pending_approval") return <PendingApproval />;
  if (profileState === "incomplete") return <CompleteProfile onComplete={checkProfile} />;
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

const LazyFallback = () => (
  <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
);

const AppRoutes = () => (
  <Suspense fallback={<LazyFallback />}>
    <Routes>
      <Route path="/auth" element={<AuthRoute />} />
      <Route path="/quick-estimate" element={<QuickEstimate />} />
      <Route path="/" element={<ProtectedRoute><MapView /></ProtectedRoute>} />
      <Route path="/portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
      <Route path="/site/:id" element={<ProtectedRoute><SiteDetail /></ProtectedRoute>} />
      <Route path="/la-programme" element={<ProtectedRoute><LaProgramme /></ProtectedRoute>} />
      <Route path="/studies" element={<ProtectedRoute><Studies /></ProtectedRoute>} />
      <Route path="/study/:id" element={<ProtectedRoute><StudyDetail /></ProtectedRoute>} />
      <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
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
