import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GitPullRequest } from "lucide-react";
import WpEstimateVariations from "@/components/delivery/WpEstimateVariations";

const fmt = (n: number | null | undefined, ccy = "GBP") =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(Number(n));

const signed = (n: number, ccy = "GBP") =>
  (n > 0 ? "+" : n < 0 ? "-" : "") + fmt(Math.abs(n), ccy);

export default function WpVariationsTab() {
  const { id: wpId } = useParams<{ id: string }>();

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["wp-estimates-for-variations", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_package_estimates")
        .select("*")
        .eq("work_package_id", wpId!)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const estimateIds = (estimates as any[]).map((e) => e.id);

  const { data: variations = [] } = useQuery({
    queryKey: ["wp-variations-all", wpId, estimateIds.join(",")],
    enabled: estimateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_estimate_variations" as any)
        .select("id,status,delta_price,wp_estimate_id")
        .in("wp_estimate_id", estimateIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rollup = useMemo(() => {
    const list = variations as any[];
    return {
      total: list.length,
      draft: list.filter((v) => v.status === "DRAFT").length,
      submitted: list.filter((v) => v.status === "SUBMITTED").length,
      approved: list.filter((v) => v.status === "APPROVED").length,
      rejected: list.filter((v) => v.status === "REJECTED").length,
      approvedDelta: list.filter((v) => v.status === "APPROVED").reduce((s, v) => s + Number(v.delta_price || 0), 0),
      pendingDelta: list.filter((v) => v.status === "SUBMITTED").reduce((s, v) => s + Number(v.delta_price || 0), 0),
    };
  }, [variations]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Variations</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Change requests and PO amendments raised against approved work-package estimates.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 5</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Total" value={String(rollup.total)} />
        <Metric label="Pending approval" value={String(rollup.submitted)} />
        <Metric label="Approved Δ" value={signed(rollup.approvedDelta)} tone={rollup.approvedDelta > 0 ? "amber" : rollup.approvedDelta < 0 ? "green" : undefined} />
        <Metric label="Pending Δ" value={signed(rollup.pendingDelta)} />
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading variations…</Card>
      ) : estimates.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <GitPullRequest className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">No estimates yet</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Variations are raised against approved work-package estimates. Create and approve an estimate
            first in the Estimating tab.
          </p>
        </Card>
      ) : (
        <Accordion
          type="single"
          collapsible
          defaultValue={(estimates as any[])[0]?.id}
          className="space-y-2"
        >
          {(estimates as any[]).map((e) => (
            <AccordionItem key={e.id} value={e.id} className="border rounded-lg bg-card">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4 gap-3">
                  <div className="text-left">
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      v{e.version_number} · {e.status}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total price</div>
                    <div className="font-semibold">{fmt(e.total_price, e.currency)}</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <WpEstimateVariations estimate={e} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  const cls = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "";
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${cls}`}>{value}</div>
    </Card>
  );
}