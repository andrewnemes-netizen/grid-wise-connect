import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useParams, Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WpSidebar } from "@/components/wp/WpSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import {
  WpOverview,
  WpSiteRegister,
  WpMap,
  WpPreCon,
  WpReadiness,
  WpMatrix,
  WpEstimating,
  WpPocEstimates,
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
  WpSurveys,
} from "./wp/WpTabs";
import WpDesignDetail from "./wp/WpDesignDetail";

function WpHeader({ wpId }: { wpId: string }) {
  const [meta, setMeta] = useState<{ name: string | null; status: string | null } | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
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

  const handleDelete = async () => {
    if (!reason.trim()) { toast.error("Reason is required"); return; }
    setDeleting(true);
    const { error } = await supabase.rpc("delete_work_package" as any, {
      _wp_id: wpId, _reason: reason.trim(),
    });
    setDeleting(false);
    if (error) { toast.error(error.message ?? "Failed to archive"); return; }
    toast.success("Work package archived (90-day retention). Restore from /admin/archive.");
    navigate("/programmes");
  };

  return (
    <header className="h-14 border-b bg-background/95 backdrop-blur sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-4">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/programmes" className="hover:underline">Programmes</Link>
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
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1">
            <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Archive WP</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this work package?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the work package and all its scoped records (tasks, estimates, POs,
              permits, RAMS, photos, etc.). A snapshot is kept in the archive for 90 days, after
              which it is purged permanently. Linked sites remain in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="wp-archive-reason">Reason (required)</Label>
            <Input id="wp-archive-reason" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. duplicate of WY-04, cancelled by client" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || !reason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
            >
              {deleting ? "Archiving…" : "Archive work package"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <NotificationsBell />
    </header>
  );
}

export default function WorkPackageShell() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/programmes" replace />;

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
              <Route path="sites/matrix" element={<WpMatrix />} />
              <Route path="sites/surveys" element={<WpSurveys />} />
              <Route path="commercial/estimating" element={<WpEstimating />} />
              <Route path="commercial/poc-estimates" element={<WpPocEstimates />} />
              <Route path="commercial/purchase-orders" element={<WpPurchaseOrders />} />
              <Route path="commercial/variations" element={<WpVariations />} />
              <Route path="engineering/grid-studies" element={<WpGridStudies />} />
              <Route path="engineering/dno-offers" element={<WpDnoOffers />} />
              <Route path="engineering/design" element={<WpDesign />} />
              <Route path="engineering/design/:submissionId" element={<WpDesignDetail />} />
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