import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PoundSterling, Wallet, ReceiptText, TrendingUp, Zap, CheckCircle2, PackageCheck, AlertTriangle, Calculator, ArrowRight, Target, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        .select("site_id, stage, workflow_status")
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

  const { data: activePOs } = useQuery({
    queryKey: ["wp-active-pos", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id,order_value,status")
        .eq("work_package_id", wpId!)
        .eq("status", "active");
      if (error) throw error;
      const rows = data ?? [];
      const total = rows.reduce((s, r: any) => s + Number(r.order_value ?? 0), 0);
      return { count: rows.length, total };
    },
  });

  const { data: evBuild } = useQuery({
    queryKey: ["wp-ev-build-estimate-summary", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .select("id,total_price,grand_total,currency,status")
        .eq("work_package_id", wpId!)
        .eq("kind", "build")
        .is("deleted_at", null);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const total = rows.reduce((s, r) => s + Number(r.grand_total ?? r.total_price ?? 0), 0);
      return { count: rows.length, total };
    },
  });

  const { data: pocEst } = useQuery({
    queryKey: ["wp-poc-estimate-summary", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .select("id,total_price,grand_total,currency,status")
        .eq("work_package_id", wpId!)
        .eq("kind", "poc")
        .is("deleted_at", null);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const total = rows.reduce((s, r) => s + Number(r.grand_total ?? r.total_price ?? 0), 0);
      return { count: rows.length, total };
    },
  });

  const totalSites = siteCount ?? 0;

  const totalOpportunity = Number(evBuild?.total ?? 0) + Number(pocEst?.total ?? 0);
  const poSecured = Number(activePOs?.total ?? 0);
  const hasAnyPO = (activePOs?.count ?? 0) > 0;
  const actualCost = Number(commercial?.actual_cost ?? 0);
  const forecastMargin = poSecured - actualCost;
  const forecastMarginPct = poSecured > 0 ? forecastMargin / poSecured : null;
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
  const stageEntries: [string, number][] = STAGE_KEYS.map((k): [string, number] => {
    const done = (stages as any[]).filter((r) => r.stage === k && r.workflow_status === "done").length;
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
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon={<Target className="h-4 w-4" />} label="Total Opportunity" value={gbp(totalOpportunity)}
                      sub="EV Build + ICP quoted" />
              <KpiCard icon={<Calculator className="h-4 w-4" />} label="EV Build Opportunity" value={gbp(evBuild?.total)}
                      sub={`${evBuild?.count ?? 0} quote${(evBuild?.count ?? 0) === 1 ? "" : "s"}`} />
              <KpiCard icon={<Zap className="h-4 w-4" />} label="ICP Opportunity" value={gbp(pocEst?.total)}
                      sub={`${pocEst?.count ?? 0} quote${(pocEst?.count ?? 0) === 1 ? "" : "s"}`} />
              <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="PO Secured" value={gbp(poSecured)}
                      sub={hasAnyPO ? `${activePOs?.count} active PO${(activePOs?.count ?? 0) === 1 ? "" : "s"}` : "No PO received yet"}
                      tone={hasAnyPO ? "success" : undefined} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon={<Wallet className="h-4 w-4" />} label="Budget" value={gbp(commercial?.budget_amount_manual)} />
              <KpiCard icon={<PoundSterling className="h-4 w-4" />} label="Actual cost" value={gbp(actualCost)}
                      sub={poSecured > 0 ? `${pct(actualCost / poSecured)} of PO secured` : undefined} />
              <KpiCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Forecast margin"
                value={hasAnyPO ? gbp(forecastMargin) : "—"}
                sub={hasAnyPO ? (forecastMarginPct != null ? pct(forecastMarginPct) : undefined) : "Based on PO Secured, once received"}
                tone={hasAnyPO ? (forecastMargin < 0 ? "danger" : "success") : undefined}
              />
              <KpiCard icon={<ReceiptText className="h-4 w-4" />} label="% Secured by PO" value={totalOpportunity > 0 ? pct(poSecured / totalOpportunity) : "—"}
                      sub="PO Secured vs Total Opportunity" />
            </div>
          </div>
        )}
      </div>

      {/* Delivery health */}
      {/* Estimate types — kept explicitly separate */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Estimate types</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calculator className="h-4 w-4" /> EV Build Estimates
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="text-2xl font-semibold tabular-nums">
                {gbp(evBuild?.total)}
              </div>
              <div className="text-xs text-muted-foreground">
                {evBuild?.count ?? 0} estimate{(evBuild?.count ?? 0) === 1 ? "" : "s"} · install / build scope
              </div>
              <Button asChild size="sm" variant="outline" className="mt-1">
               <Link to="../commercial/estimating">Open EV Build Estimates <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-primary" /> PoC Estimates
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="text-2xl font-semibold tabular-nums text-primary">
                {gbp(pocEst?.total)}
              </div>
              <div className="text-xs text-muted-foreground">
                {pocEst?.count ?? 0} estimate{(pocEst?.count ?? 0) === 1 ? "" : "s"} · DNO Point-of-Connection application
              </div>
              <Button asChild size="sm" variant="outline" className="mt-1">
                <Link to="../commercial/poc-estimates">Open PoC Estimates <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          PoC and EV Build estimates are tracked independently. Totals above are shown per type and are
          never combined into a single figure.
        </p>
      </div>

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
