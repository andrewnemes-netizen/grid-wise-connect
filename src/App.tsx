import { useEffect, lazy, Suspense, useState, useCallback, useRef } from "react";
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
const RateCardDetail = lazy(() => import("./pages/RateCardDetail"));
const ArchiveConsole = lazy(() => import("./pages/admin/ArchiveConsole"));
const CapabilityGrantsConsole = lazy(() => import("./pages/admin/CapabilityGrantsConsole"));
const LaProgramme = lazy(() => import("./pages/LaProgramme"));
const QuickEstimate = lazy(() => import("./pages/QuickEstimate"));
const Training = lazy(() => import("./pages/Training"));
const Studies = lazy(() => import("./pages/Studies"));
const StudyDetail = lazy(() => import("./pages/StudyDetail"));
const DeliveryProgrammes = lazy(() => import("./pages/DeliveryProgrammes"));
const ClientsDashboard = lazy(() => import("./pages/ClientsDashboard"));
const DeliveryProjects = lazy(() => import("./pages/DeliveryProjects"));
const DeliveryProjectDetail = lazy(() => import("./pages/DeliveryProjectDetail"));
const DeliveryProposals = lazy(() => import("./pages/DeliveryProposals"));
const DeliveryProposalDetail = lazy(() => import("./pages/DeliveryProposalDetail"));
const DeliveryRevenue = lazy(() => import("./pages/DeliveryRevenue"));
const IntelligenceLayout = lazy(() => import("./pages/intelligence/IntelligenceLayout"));
const ExecutiveDashboard = lazy(() => import("./pages/intelligence/ExecutiveDashboard"));
const ClientMonthlyReport = lazy(() => import("./pages/intelligence/ClientMonthlyReport"));
const IntelligenceComingSoon = lazy(() => import("./pages/intelligence/ComingSoon"));
const NotFound = lazy(() => import("./pages/NotFound"));
const UnsubscribePage = lazy(() => import("./pages/Unsubscribe"));
const SurveyForm = lazy(() => import("./pages/SurveyForm"));
const Assistant = lazy(() => import("./pages/Assistant"));
const ImportWizard = lazy(() => import("./pages/ImportWizard"));
const WorkPackageShell = lazy(() => import("./pages/WorkPackageShell"));
const PartnerLayout = lazy(() => import("./pages/partner/PartnerLayout"));
const PartnerDashboard = lazy(() => import("./pages/partner/PartnerDashboard"));
const PartnerSites = lazy(() => import("./pages/partner/PartnerSites"));
const PartnerHandover = lazy(() => import("./pages/partner/PartnerHandover"));
const PartnerSnags = lazy(() => import("./pages/partner/PartnerSnags"));
const SurveysPage = lazy(() => import("./pages/Surveys"));

const queryClient = new QueryClient();

function ProtectedRoute({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  const { user, loading } = useAuth();
  const [profileState, setProfileState] = useState<"loading" | "complete" | "incomplete" | "pending_approval">("loading");
  const lastCheckedUserId = useRef<string | null>(null);

  const checkProfile = useCallback(async () => {
    if (!user) return;
    // Reset to loading when checking a new/different user
    if (lastCheckedUserId.current !== user.id) {
      setProfileState("loading");
      lastCheckedUserId.current = user.id;
    }
    try {
      const { data: rows, error } = await supabase.rpc("get_own_profile");
      const data = Array.isArray(rows) ? rows[0] : null;
      if (error || !data) {
        setProfileState("incomplete");
        return;
      }

      if (!data.full_name?.trim() || !data.company?.trim() || !data.phone?.trim()) {
        setProfileState("incomplete");
        return;
      }

      if (!data.is_approved) {
        setProfileState("pending_approval");
        return;
      }

      setProfileState("complete");
    } catch {
      // Fail closed: never leave user in infinite loading
      setProfileState("incomplete");
    }
  }, [user]);

  useEffect(() => {
    if (!loading && user) {
      checkProfile();
    } else if (!loading && !user) {
      // Don't set profileState to "loading" — that would block the redirect
      lastCheckedUserId.current = null;
    }
  }, [loading, user, checkProfile]);

  // 1. Wait for auth to finish
  if (loading)
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  // 2. Redirect unauthenticated users immediately — never depend on profileState
  if (!user) return <Navigate to="/auth" replace />;
  // 3. Wait for profile check to finish (only for authenticated users)
  if (profileState === "loading")
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (profileState === "pending_approval") return <PendingApproval />;
  if (profileState === "incomplete") return <CompleteProfile onComplete={checkProfile} />;
  if (bare) return <>{children}</>;
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
      <Route path="/unsubscribe" element={<Suspense fallback={<LazyFallback />}><UnsubscribePage /></Suspense>} />
      <Route path="/survey/:token" element={<Suspense fallback={<LazyFallback />}><SurveyForm /></Suspense>} />
      <Route path="/" element={<ProtectedRoute><MapView /></ProtectedRoute>} />
      <Route path="/portfolio" element={<ProtectedRoute><Portfolio /></ProtectedRoute>} />
      <Route path="/surveys" element={<ProtectedRoute bare><Suspense fallback={<LazyFallback />}><SurveysPage /></Suspense></ProtectedRoute>} />
      <Route path="/site/:id" element={<ProtectedRoute><SiteDetail /></ProtectedRoute>} />
      <Route path="/la-programme" element={<ProtectedRoute><LaProgramme /></ProtectedRoute>} />
      <Route path="/studies" element={<ProtectedRoute><Studies /></ProtectedRoute>} />
      <Route path="/study/:id" element={<ProtectedRoute><StudyDetail /></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute><DeliveryProgrammes /></ProtectedRoute>} />
      <Route path="/programmes" element={<ProtectedRoute><ClientsDashboard /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><ClientsDashboard /></ProtectedRoute>} />
      <Route path="/programmes/client/:clientId" element={<ProtectedRoute><DeliveryProgrammes /></ProtectedRoute>} />
      <Route path="/delivery/proposals" element={<ProtectedRoute><DeliveryProposals /></ProtectedRoute>} />
      <Route path="/delivery/proposal/:id" element={<ProtectedRoute><DeliveryProposalDetail /></ProtectedRoute>} />
      <Route path="/delivery/revenue" element={<ProtectedRoute><DeliveryRevenue /></ProtectedRoute>} />
      <Route path="/delivery/projects" element={<ProtectedRoute><DeliveryProjects /></ProtectedRoute>} />
      <Route path="/delivery/project/:id" element={<ProtectedRoute><DeliveryProjectDetail /></ProtectedRoute>} />
      <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      <Route path="/admin/archive" element={<ProtectedRoute><ArchiveConsole /></ProtectedRoute>} />
      <Route path="/admin/capabilities" element={<ProtectedRoute><CapabilityGrantsConsole /></ProtectedRoute>} />
      <Route path="/admin/rate-cards/:versionId" element={<ProtectedRoute><Suspense fallback={<LazyFallback />}><RateCardDetail /></Suspense></ProtectedRoute>} />
      <Route path="/intelligence" element={<ProtectedRoute><IntelligenceLayout /></ProtectedRoute>}>
        <Route index element={<ExecutiveDashboard />} />
        <Route path="client-report" element={<ClientMonthlyReport />} />
        <Route path="wp-report" element={<IntelligenceComingSoon title="WP Reports" note="Per-work-package passport report — ships in slice 4." />} />
        <Route path="site-report" element={<IntelligenceComingSoon title="Site Reports" note="Per-site passport report — ships in slice 4." />} />
        <Route path="ask" element={<IntelligenceComingSoon title="Ask Gridwise" note="Natural-language programme Q&A — ships in slice 5." />} />
      </Route>
      <Route path="/assistant" element={<ProtectedRoute><Assistant /></ProtectedRoute>} />
      <Route path="/assistant/:threadId" element={<ProtectedRoute><Assistant /></ProtectedRoute>} />
      <Route path="/import/wizard" element={<ProtectedRoute><ImportWizard /></ProtectedRoute>} />
      <Route path="/import/wizard/:batchId" element={<ProtectedRoute><ImportWizard /></ProtectedRoute>} />
      <Route path="/wp/:id/*" element={<ProtectedRoute bare><WorkPackageShell /></ProtectedRoute>} />
      <Route path="/partner" element={<ProtectedRoute bare><PartnerLayout /></ProtectedRoute>}>
        <Route index element={<PartnerDashboard />} />
        <Route path="sites" element={<PartnerSites />} />
        <Route path="handover" element={<PartnerHandover />} />
        <Route path="snags" element={<PartnerSnags />} />
      </Route>
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
