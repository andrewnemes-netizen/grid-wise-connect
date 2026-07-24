import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Calculator, Zap, FileCheck2, TrendingUp } from "lucide-react";

const gbp = (n: number | null | undefined) =>
  n == null ? "£0" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "success" | "danger" }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "success" ? "text-emerald-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="py-3 space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Same shape as the Work Package Overview's Commercial Position section,
 * scoped to one site. Purchase Orders themselves are WP-level (not
 * site-level), so "PO Secured" here is a best-effort figure — it only
 * counts PO lines that have actually been itemised against this site's
 * quote lines. If POs aren't itemised, this will show £0 even though a
 * PO exists at the WP level.
 */
export function SiteCommercialOverview({ siteId }: { siteId: string }) {
  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["site-commercial-estimates", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .select("id,kind,total_price,grand_total,total_cost")
        .eq("site_id", siteId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: poSecured = 0 } = useQuery({
    queryKey: ["site-po-secured", siteId, estimates.map((e: any) => e.id).join(",")],
    enabled: estimates.length > 0,
    queryFn: async () => {
      const estimateIds = estimates.map((e: any) => e.id);
      const { data: lines, error: e1 } = await supabase
        .from("estimate_lines" as any)
        .select("id")
        .in("estimate_id", estimateIds);
      if (e1) throw e1;
      const lineIds = (lines ?? []).map((l: any) => l.id);
      if (lineIds.length === 0) return 0;

      const { data: poLines, error: e2 } = await supabase
        .from("po_lines" as any)
        .select("line_value, purchase_orders(status)")
        .in("estimate_line_id", lineIds);
      if (e2) throw e2;

      return (poLines ?? []).reduce((sum: number, l: any) => {
        const active = l.purchase_orders?.status === "active";
        return active ? sum + Number(l.line_value ?? 0) : sum;
      }, 0);
    },
  });

  const evBuild = estimates.filter((e: any) => e.kind === "build");
  const poc = estimates.filter((e: any) => e.kind === "poc");
  const sum = (rows: any[], field: string) => rows.reduce((s, r) => s + Number(r[field] ?? 0), 0);

  const evBuildTotal = evBuild.reduce((s, r) => s + Number(r.grand_total ?? r.total_price ?? 0), 0);
  const pocTotal = poc.reduce((s, r) => s + Number(r.grand_total ?? r.total_price ?? 0), 0);
  const totalOpportunity = evBuildTotal + pocTotal;
  const totalCost = sum(estimates, "total_cost");
  const marginPct = totalOpportunity > 0 ? (totalOpportunity - totalCost) / totalOpportunity : null;

  if (isLoading) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Commercial position</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={<Target className="h-4 w-4" />} label="Total Opportunity" value={gbp(totalOpportunity)} />
        <KpiCard icon={<Calculator className="h-4 w-4" />} label="EV Build Opportunity" value={gbp(evBuildTotal)}
                sub={`${evBuild.length} quote${evBuild.length === 1 ? "" : "s"}`} />
        <KpiCard icon={<Zap className="h-4 w-4" />} label="ICP Opportunity" value={gbp(pocTotal)}
                sub={`${poc.length} quote${poc.length === 1 ? "" : "s"}`} />
        <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="PO Secured" value={gbp(poSecured)}
                sub={poSecured > 0 ? "Itemised to this site" : "No PO itemised to this site yet"}
                tone={poSecured > 0 ? "success" : undefined} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Margin %" value={pct(marginPct)}
                tone={marginPct != null ? (marginPct < 0 ? "danger" : "success") : undefined} />
      </div>
    </div>
  );
}
