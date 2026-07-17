import { useQuery } from "@tanstack/react-query";
import { loadKpis, type Kpis } from "@/lib/intelligence/kpis";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const money = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n || 0);

function KpiTile({
  label,
  value,
  sub,
  intent,
}: {
  label: string;
  value: string;
  sub?: string;
  intent?: "green" | "amber" | "red" | "muted";
}) {
  const border =
    intent === "green"
      ? "border-l-emerald-500"
      : intent === "amber"
      ? "border-l-amber-500"
      : intent === "red"
      ? "border-l-rose-500"
      : "border-l-primary/60";
  return (
    <Card className={`p-4 border-l-4 ${border}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function RagBadge({ health }: { health: Kpis["programmeHealth"] }) {
  const cls =
    health === "GREEN"
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
      : health === "AMBER"
      ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
      : "bg-rose-500/15 text-rose-600 border-rose-500/30";
  return (
    <Badge variant="outline" className={cls}>
      Programme Health · {health}
    </Badge>
  );
}

export default function ExecutiveDashboard() {
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["intelligence-executive-kpis"],
    queryFn: () => loadKpis(),
    refetchOnWindowFocus: false,
  });

  const [aiLoading, setAiLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const generateSummary = async () => {
    if (!kpis) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("intelligence-summary", {
        body: { context: "executive", kpis },
      });
      if (error) throw error;
      setSummary(data?.summary ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate summary");
    } finally {
      setAiLoading(false);
    }
  };

  if (isLoading || !kpis) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const outstandingSurveys = kpis.surveysRequested - kpis.surveysCompleted;
  const designsInReview = Math.max(0, kpis.designsIssued - kpis.designsApproved);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <RagBadge health={kpis.programmeHealth} />
          <span className="text-sm text-muted-foreground">
            {new Date(kpis.window.from).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={generateSummary} disabled={aiLoading}>
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          AI Morning Brief
        </Button>
      </div>

      {summary && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> AI Executive Summary
          </div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{summary}</div>
        </Card>
      )}

      {/* KPI grid — 15 tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KpiTile label="Revenue (month)" value={money(kpis.revenueMonthNet)} intent="green" />
        <KpiTile
          label="Gross Margin"
          value={`${Math.round(kpis.grossMargin * 100)}%`}
          intent={kpis.grossMargin > 0.2 ? "green" : kpis.grossMargin > 0.1 ? "amber" : "red"}
        />
        <KpiTile label="Sites Delivered" value={String(kpis.sitesDelivered)} sub={`of ${kpis.sitesTotal} in scope`} />
        <KpiTile
          label="Sites Behind"
          value={String(kpis.sitesBehind)}
          intent={kpis.sitesBehind === 0 ? "green" : kpis.sitesBehind < 5 ? "amber" : "red"}
        />
        <KpiTile label="Ready for Construction" value={String(kpis.readyForConstruction)} />
        <KpiTile label="Ready for Energisation" value={String(kpis.readyForEnergisation)} />
        <KpiTile
          label="POC Approval Rate"
          value={kpis.pocSubmitted ? `${Math.round((kpis.pocApproved / kpis.pocSubmitted) * 100)}%` : "—"}
          sub={`${kpis.pocApproved}/${kpis.pocSubmitted}`}
        />
        <KpiTile
          label="POCs Outstanding"
          value={String(kpis.pocOutstanding)}
          intent={kpis.pocOutstanding > 10 ? "red" : kpis.pocOutstanding > 3 ? "amber" : "green"}
        />
        <KpiTile
          label="Surveys Outstanding"
          value={String(outstandingSurveys)}
          intent={outstandingSurveys > 10 ? "red" : outstandingSurveys > 3 ? "amber" : "green"}
        />
        <KpiTile label="Designs In Review" value={String(designsInReview)} />
        <KpiTile label="Avg Days / Stage" value={kpis.avgDaysPerStage.toFixed(1)} />
        <KpiTile label="Commercial Pipeline" value={money(kpis.pipelineValue)} />
        <KpiTile label="Variations (active)" value={money(kpis.variationValue)} />
        <KpiTile label="Actual Costs (month)" value={money(kpis.actualCostsMonth)} />
        <KpiTile
          label="Forecast Margin"
          value={
            kpis.pipelineValue
              ? `${Math.round(((kpis.pipelineValue + kpis.variationValue - kpis.actualCostsMonth) / kpis.pipelineValue) * 100)}%`
              : "—"
          }
        />
      </div>

      {/* Large charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Sites by stage</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kpis.sitesByStage}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Revenue trend (last 6 months)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kpis.revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `£${Math.round(v / 1000)}k` : `£${v}`)} />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Line type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
