import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useParams, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WpSidebar } from "@/components/wp/WpSidebar";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import {
  WpOverview,
  WpSiteRegister,
  WpMap,
  WpPreCon,
  WpReadiness,
  WpEstimating,
  WpPurchaseOrders,
  WpVariations,
  WpGridStudies,
  WpDnoOffers,
  WpDesign,
  WpProgramme,
  WpTasks,
  WpPartners,
  WpDocuments,
  WpPhotos,
  WpAudit,
  WpCommissioning,
} from "./wp/WpTabs";

function WpHeader({ wpId }: { wpId: string }) {
  const [meta, setMeta] = useState<{ name: string | null; status: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("work_packages")
        .select("name, status")
        .eq("id", wpId)
        .maybeSingle();
      if (!cancelled) setMeta(data ?? { name: null, status: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [wpId]);

  return (
    <header className="h-14 border-b bg-background/95 backdrop-blur sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-4">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/delivery" className="hover:underline">Programmes</Link>
          <span>/</span>
          <span className="truncate">Work Package</span>
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm sm:text-base font-medium truncate">
            {meta?.name ?? "Loading…"}
          </h2>
          {meta?.status && (
            <Badge variant="secondary" className="text-[10px] uppercase">{meta.status}</Badge>
          )}
        </div>
      </div>
      <NotificationsBell />
    </header>
  );
}

export default function WorkPackageShell() {
  const { id } = useParams<{ id: string }>();
  const { enabled, loading } = useFeatureFlag("gridwise_os_shell");

  if (!id) return <Navigate to="/delivery" replace />;
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Loading Work Package…</div>
    );
  }
  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-lg border p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold">Gridwise OS shell is off</h1>
          <p className="text-sm text-muted-foreground">
            The new Work Package workspace is behind the <code>gridwise_os_shell</code> feature flag. Ask an
            administrator to enable it for your account or organisation.
          </p>
          <Button asChild variant="outline">
            <Link to={`/delivery/wp/${id}`}>Open legacy Work Package</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/20">
        <WpSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <WpHeader wpId={id} />
          <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden">
            <Routes>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<WpOverview />} />
              <Route path="sites/register" element={<WpSiteRegister />} />
              <Route path="sites/map" element={<WpMap />} />
              <Route path="sites/pre-construction" element={<WpPreCon />} />
              <Route path="sites/readiness" element={<WpReadiness />} />
              <Route path="commercial/estimating" element={<WpEstimating />} />
              <Route path="commercial/purchase-orders" element={<WpPurchaseOrders />} />
              <Route path="commercial/variations" element={<WpVariations />} />
              <Route path="engineering/grid-studies" element={<WpGridStudies />} />
              <Route path="engineering/dno-offers" element={<WpDnoOffers />} />
              <Route path="engineering/design" element={<WpDesign />} />
              <Route path="delivery/programme" element={<WpProgramme />} />
              <Route path="delivery/tasks" element={<WpTasks />} />
              <Route path="delivery/partners" element={<WpPartners />} />
              <Route path="records/documents" element={<WpDocuments />} />
              <Route path="records/photos" element={<WpPhotos />} />
              <Route path="records/audit" element={<WpAudit />} />
              <Route path="commissioning" element={<WpCommissioning />} />
              <Route path="*" element={<Navigate to="overview" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}