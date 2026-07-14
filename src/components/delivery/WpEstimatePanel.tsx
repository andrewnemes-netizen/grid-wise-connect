import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Receipt, TrendingUp, MapPin, SlidersHorizontal } from "lucide-react";

const fmt = (n: number | null | undefined, ccy = "GBP") =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(Number(n));

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    APPROVED: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    SUPERSEDED: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

export default function WpEstimatePanel({ wpId }: { wpId: string }) {
  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["wp-estimates", wpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_package_estimates")
        .select("*")
        .eq("work_package_id", wpId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading estimates…</Card>;
  }

  if (estimates.length === 0) {
    return (
      <Card className="p-8 text-center space-y-3">
        <Receipt className="h-8 w-8 mx-auto text-muted-foreground" />
        <div>
          <div className="font-medium">No work-package estimates yet</div>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            WP estimates roll up per-site estimates and add WP-level adjustments (contingency,
            prelims, overheads). The editor is next on the roadmap — this tab currently
            provides a read-only review of any estimates already in the database.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Accordion type="single" collapsible defaultValue={estimates[0].id} className="space-y-3">
        {estimates.map((e: any) => (
          <AccordionItem key={e.id} value={e.id} className="border rounded-lg bg-card">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center justify-between w-full pr-4 gap-3">
                <div className="flex items-center gap-3 text-left">
                  <div>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      v{e.version_number} · {new Date(e.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total price</div>
                    <div className="font-semibold">{fmt(e.total_price, e.currency)}</div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <EstimateDetail estimate={e} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function EstimateDetail({ estimate }: { estimate: any }) {
  const ccy = estimate.currency ?? "GBP";

  const { data: siteRows = [] } = useQuery({
    queryKey: ["wp-estimate-sites", estimate.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_estimate_sites")
        .select("*, sites(name,address), site_estimates(name,version_number,status)")
        .eq("wp_estimate_id", estimate.id)
        .order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ["wp-estimate-adjustments", estimate.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_estimate_adjustments")
        .select("*")
        .eq("wp_estimate_id", estimate.id)
        .order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 pt-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Sites cost" value={fmt(estimate.sites_total_cost, ccy)} />
        <Metric label="Adjustments" value={fmt(estimate.adjustments_total_price, ccy)} />
        <Metric label="Markup" value={fmt(estimate.total_markup, ccy)} />
        <Metric label="Total price" value={fmt(estimate.total_price, ccy)} highlight />
      </div>

      <section>
        <div className="flex items-center gap-2 mb-2 text-sm font-medium">
          <MapPin className="h-4 w-4" /> Included sites ({siteRows.length})
        </div>
        {siteRows.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">No sites linked to this estimate yet.</Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Site estimate</TableHead>
                  <TableHead>Included</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteRows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.sites?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.sites?.address ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.site_estimates?.name ?? "—"}
                      {r.site_estimates?.version_number != null && (
                        <span className="text-xs text-muted-foreground"> v{r.site_estimates.version_number}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.included ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{fmt(r.contribution_cost, ccy)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.contribution_price, ccy)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4" /> Adjustments ({adjustments.length})
        </div>
        {adjustments.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">No WP-level adjustments applied.</Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead className="text-right">Basis</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.label}</div>
                      {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{a.kind}</Badge></TableCell>
                    <TableCell className="text-sm">{a.applies_to}</TableCell>
                    <TableCell className="text-right text-sm">
                      {a.is_percentage && a.percentage != null ? `${Number(a.percentage)}%` : "Fixed"}
                    </TableCell>
                    <TableCell className="text-right">{fmt(a.amount_cost, ccy)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(a.amount_price, ccy)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {estimate.notes && (
        <section className="text-sm">
          <div className="font-medium mb-1">Notes</div>
          <Card className="p-3 text-muted-foreground whitespace-pre-wrap">{estimate.notes}</Card>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {highlight && <TrendingUp className="h-3 w-3" />} {label}
      </div>
      <div className={`text-lg font-semibold mt-1 ${highlight ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}