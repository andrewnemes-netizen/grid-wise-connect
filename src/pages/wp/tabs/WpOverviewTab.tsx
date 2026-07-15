import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PoundSterling, Wallet, ReceiptText, TrendingUp, Zap, CheckCircle2, PackageCheck, AlertTriangle } from "lucide-react";

function gbp(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(v));
}

function pct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.round(Number(v) * 100) / 100}%`;
}

export default function WpOverviewTab() {
  const { id: wpId } = useParams<{ id: string }>();

  const { data: commercial, isLoading: loadingCommercial } = useQuery({
    queryKey: ["wp-commercial", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_wp_commercial_position")
        .select("*")
        .eq("work_package_id", wpId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: readiness = [] } = useQuery({
    queryKey: ["wp-readiness", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_site_handover_readiness")
        .select("*")
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["wp-stage-rollup", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_stage_status")
        .select("survey, design, dno, permit, civils, electrical, meter, handover")
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: siteCount } = useQuery({
    queryKey: ["wp-site-count", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("wp_sites")
        .select("*", { count: "exact", head: true })
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const totalSites = siteCount ?? 0;
  const energisedCount = readiness.filter((r: any) => r.is_energised).length;
  const commissionedCount = readiness.filter((r: any) => r.is_commissioned).length;
  const readyForHandoverCount = readiness.filter((r: any) => r.ready_for_handover).length;
  const openSnags = readiness.reduce((sum: number, r: any) => sum + Number(r.snag_open ?? 0), 0);
  const criticalSnags = readiness.reduce((sum: number, r: any) => sum + Number(r.snag_open_critical ?? 0), 0);

  const STAGE_KEYS = ["survey","design","dno","permit","civils","electrical","meter","handover"] as const;
  const STAGE_LABELS: Record<string,string> = {
    survey:"Survey", design:"Design", dno:"DNO", permit:"Permit",
    civils:"Civils", electrical:"Electrical", meter:"Meter", handover:"Handover",
  };
  const stageEntries: [string, number][] = STAGE_KEYS.map((k) => {
    const done = (stages as any[]).filter((r) => {
      const v = String(r[k] ?? "").toLowerCase();
      return ["complete","completed","done","approved","signed","valid","passed"].includes(v);
    }).length;
    return [STAGE_LABELS[k], done];
  }).filter(([, n]) => n > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            KPI snapshot for this Work Package — sites by stage, commercial commitment, delivery health.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Live</Badge>
      </div>

      {/* Commercial position */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Commercial position</h2>
        {loadingCommercial ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : commercial ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<Wallet className="h-4 w-4" />} label="Budget" value={gbp(commercial.budget_amount)} />
            <KpiCard icon={<ReceiptText className="h-4 w-4" />} label="Awarded" value={gbp(commercial.awarded_grand_total)}
                    sub={commercial.awarded_cost != null ? `cost ${gbp(commercial.awarded_cost)}` : undefined} />
            <KpiCard icon={<PoundSterling className="h-4 w-4" />} label="Actual cost" value={gbp(commercial.actual_cost)}
                    sub={commercial.cost_pct_of_awarded != null ? `${pct(commercial.cost_pct_of_awarded)} of awarded` : undefined} />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Forecast margin"
              value={gbp(commercial.forecast_margin)}
              sub={commercial.forecast_margin_pct != null ? pct(commercial.forecast_margin_pct) : undefined}
              tone={Number(commercial.forecast_margin ?? 0) < 0 ? "danger" : "success"}
            />
          </div>
        ) : (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">No commercial data yet — add an estimate and PO commitments.</CardContent></Card>
        )}
      </div>

      {/* Delivery health */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Delivery health</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<Zap className="h-4 w-4" />} label="Energised" value={`${energisedCount} / ${totalSites}`} />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Commissioned" value={`${commissionedCount} / ${totalSites}`} />
          <KpiCard icon={<PackageCheck className="h-4 w-4" />} label="Handover ready" value={`${readyForHandoverCount} / ${totalSites}`} />
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Open snags"
            value={String(openSnags)}
            sub={criticalSnags > 0 ? `${criticalSnags} critical` : undefined}
            tone={criticalSnags > 0 ? "danger" : undefined}
          />
        </div>

        {totalSites > 0 && (
          <Card className="mt-3">
            <CardContent className="py-4 space-y-3">
              <ProgressRow label="Energised" value={energisedCount} total={totalSites} />
              <ProgressRow label="Commissioned" value={commissionedCount} total={totalSites} />
              <ProgressRow label="Handover ready" value={readyForHandoverCount} total={totalSites} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stage rollup */}
      {stageEntries.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sites by stage</h2>
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-2">
                {stageEntries.map(([name, count]) => (
                  <div key={name} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
                    <span className="text-xs font-medium">{name}</span>
                    <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <Link to="../sites/register" className="underline">Open the Site Register →</Link>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "success" | "danger" }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "success" ? "text-emerald-600" : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {icon}{label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pctVal = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{value} / {total} ({pctVal}%)</span>
      </div>
      <Progress value={pctVal} />
    </div>
  );
}