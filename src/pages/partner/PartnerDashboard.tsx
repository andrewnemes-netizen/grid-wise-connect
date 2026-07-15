import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerWorkPackages } from "./usePartnerData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, FileCheck2, Zap } from "lucide-react";

interface Stats {
  commissioned: number;
  energised: number;
  handoverReady: number;
  openSnags: number;
  criticalSnags: number;
  unackedSnags: number;
}

export default function PartnerDashboard() {
  const { workPackages, workPackageIds, loading: wpLoading } = usePartnerWorkPackages();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wpLoading) return;
    if (workPackageIds.length === 0) {
      setStats({ commissioned: 0, energised: 0, handoverReady: 0, openSnags: 0, criticalSnags: 0, unackedSnags: 0 });
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const [commRes, snagRes, handRes] = await Promise.all([
        supabase.from("commissioning_records").select("id, status").in("work_package_id", workPackageIds),
        supabase
          .from("snagging_items")
          .select("id, status, severity, partner_acknowledged_at")
          .in("work_package_id", workPackageIds),
        supabase.from("handover_packs").select("id, status").in("work_package_id", workPackageIds),
      ]);
      const comms = (commRes.data ?? []) as Array<{ status: string }>;
      const snags = (snagRes.data ?? []) as Array<{ status: string; severity: string; partner_acknowledged_at: string | null }>;
      const hands = (handRes.data ?? []) as Array<{ status: string }>;
      const openSnags = snags.filter((s) => ["open", "in_progress"].includes(s.status));
      setStats({
        commissioned: comms.filter((c) => c.status === "commissioned").length,
        energised: comms.filter((c) => ["energised", "commissioned"].includes(c.status)).length,
        handoverReady: hands.filter((h) => ["client_signed", "completed"].includes(h.status)).length,
        openSnags: openSnags.length,
        criticalSnags: openSnags.filter((s) => s.severity === "critical").length,
        unackedSnags: openSnags.filter((s) => !s.partner_acknowledged_at).length,
      });
      setLoading(false);
    })();
  }, [workPackageIds.join(","), wpLoading]);

  if (wpLoading || loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {workPackages.length} allocated work package{workPackages.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Energised" value={s.energised} icon={Zap} tone="default" />
        <StatCard label="Commissioned" value={s.commissioned} icon={CheckCircle2} tone="success" />
        <StatCard label="Handovers complete" value={s.handoverReady} icon={FileCheck2} tone="default" />
        <StatCard
          label="Outstanding items"
          value={s.openSnags}
          icon={AlertTriangle}
          tone={s.criticalSnags > 0 ? "danger" : "warn"}
          hint={s.unackedSnags > 0 ? `${s.unackedSnags} awaiting acknowledgement` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your work packages</CardTitle>
        </CardHeader>
        <CardContent>
          {workPackages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allocated work packages yet.</p>
          ) : (
            <ul className="divide-y">
              {workPackages.map((wp) => (
                <li key={wp.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{wp.name ?? wp.code ?? wp.id}</div>
                    <div className="text-xs text-muted-foreground">{wp.code}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">{wp.status ?? "—"}</Badge>
                    <Link
                      className="text-xs text-primary hover:underline"
                      to={`/partner/sites?wp=${wp.id}`}
                    >
                      View sites
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "success" | "warn" | "danger";
  hint?: string;
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warn"
      ? "text-amber-600"
      : tone === "danger"
      ? "text-destructive"
      : "text-primary";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-3xl font-semibold mt-1">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <Icon className={`h-6 w-6 ${toneCls}`} />
        </div>
      </CardContent>
    </Card>
  );
}