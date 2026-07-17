import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadKpis } from "@/lib/intelligence/kpis";
import { generateClientMonthlyPdf } from "@/lib/intelligence/reportPdf";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Sparkles, Loader2, FileBarChart } from "lucide-react";
import { toast } from "sonner";

function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n || 0);

export default function ClientMonthlyReport() {
  const [clientId, setClientId] = useState<string>("");
  const [monthISO, setMonthISO] = useState<string>(monthOptions()[0].value);
  const [summary, setSummary] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["intelligence-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: kpis, isFetching } = useQuery({
    queryKey: ["intelligence-client-kpis", clientId, monthISO],
    queryFn: () => loadKpis({ clientId: clientId || null, monthISO }),
    enabled: !!clientId,
  });

  const selectedClient = clients?.find((c: any) => c.id === clientId);
  const monthLabel = monthOptions().find((m) => m.value === monthISO)?.label ?? monthISO;

  const runAi = async () => {
    if (!kpis || !selectedClient) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("intelligence-summary", {
        body: {
          context: "client_monthly",
          kpis,
          meta: { client: selectedClient.name, month: monthLabel },
        },
      });
      if (error) throw error;
      setSummary(data?.summary ?? "");
      toast.success("AI summary generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate summary");
    } finally {
      setAiLoading(false);
    }
  };

  const exportPdf = () => {
    if (!kpis || !selectedClient) return;
    const blob = generateClientMonthlyPdf({
      clientName: selectedClient.name,
      monthLabel,
      kpis,
      execSummary: summary || undefined,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedClient.name.replace(/\s+/g, "_")}_${monthISO}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <div className="text-xs text-muted-foreground mb-1">Client</div>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {(clients ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-48">
            <div className="text-xs text-muted-foreground mb-1">Month</div>
            <Select value={monthISO} onValueChange={setMonthISO}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions().map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1" />
          <Button variant="outline" onClick={runAi} disabled={!kpis || aiLoading}>
            {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI Exec Summary
          </Button>
          <Button onClick={exportPdf} disabled={!kpis}>
            <Download className="h-4 w-4 mr-2" /> Export PDF
          </Button>
        </div>
      </Card>

      {!clientId && (
        <Card className="p-10 text-center text-muted-foreground">
          <FileBarChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Select a client to generate a monthly report.
        </Card>
      )}

      {clientId && (isFetching || !kpis) && (
        <div className="grid md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {kpis && selectedClient && (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">{selectedClient.name}</h2>
              <p className="text-sm text-muted-foreground">Monthly Programme Report · {monthLabel}</p>
            </div>
            <Badge
              variant="outline"
              className={
                kpis.programmeHealth === "GREEN"
                  ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                  : kpis.programmeHealth === "AMBER"
                  ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                  : "bg-rose-500/15 text-rose-600 border-rose-500/30"
              }
            >
              RAG · {kpis.programmeHealth}
            </Badge>
          </div>

          {summary && (
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Executive Summary
              </div>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{summary}</div>
            </Card>
          )}

          <Section title="Programme Delivery">
            <Row k="Total sites in scope" v={String(kpis.sitesTotal)} />
            <Row k="Sites delivered" v={String(kpis.sitesDelivered)} />
            <Row k="Sites behind programme" v={String(kpis.sitesBehind)} />
            <Row k="Ready for Construction" v={String(kpis.readyForConstruction)} />
            <Row k="Ready for Energisation" v={String(kpis.readyForEnergisation)} />
            <Row k="Avg days per stage (90d)" v={kpis.avgDaysPerStage.toFixed(1)} />
          </Section>

          <Section title="Point of Connection (DNO offers)">
            <Row k="Total submitted" v={String(kpis.pocSubmitted)} />
            <Row k="Approved / accepted" v={String(kpis.pocApproved)} />
            <Row k="Outstanding" v={String(kpis.pocOutstanding)} />
          </Section>

          <Section title="Surveys">
            <Row k="Requested" v={String(kpis.surveysRequested)} />
            <Row k="Completed" v={String(kpis.surveysCompleted)} />
            <Row k="Outstanding" v={String(kpis.surveysRequested - kpis.surveysCompleted)} />
          </Section>

          <Section title="Design">
            <Row k="Issued" v={String(kpis.designsIssued)} />
            <Row k="Approved" v={String(kpis.designsApproved)} />
            <Row k="In review" v={String(Math.max(0, kpis.designsIssued - kpis.designsApproved))} />
          </Section>

          <Section title="Commercial">
            <Row k="Revenue this month (net)" v={money(kpis.revenueMonthNet)} />
            <Row k="Actual costs this month" v={money(kpis.actualCostsMonth)} />
            <Row k="Gross margin" v={`${Math.round(kpis.grossMargin * 100)}%`} />
            <Row k="Pipeline value" v={money(kpis.pipelineValue)} />
            <Row k="Variations (active)" v={money(kpis.variationValue)} />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold border-b pb-2 mb-2">{title}</div>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  );
}
