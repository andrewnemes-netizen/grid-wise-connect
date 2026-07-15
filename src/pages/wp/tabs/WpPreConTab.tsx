import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCheck2, ShieldCheck, TrafficCone, ClipboardList, SearchCheck, Package } from "lucide-react";

function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return <Badge variant="outline">—</Badge>;
  const v = String(value).toLowerCase();
  const cls =
    ["approved", "valid", "passed", "delivered", "complete"].includes(v)
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
      : ["submitted", "applied", "pending", "in_review", "under_review"].includes(v)
      ? "bg-sky-500/15 text-sky-600 border-sky-500/30"
      : ["rejected", "expired", "failed", "cancelled"].includes(v)
      ? "bg-rose-500/15 text-rose-600 border-rose-500/30"
      : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={cls}>{value}</Badge>;
}

function useWpTable(wpId: string | undefined, table: string) {
  return useQuery({
    queryKey: ["wp-pre-con", table, wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("*, sites(site_name,postcode)")
        .eq("work_package_id", wpId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function SiteCell({ row }: { row: any }) {
  return (
    <div className="text-sm">
      <div>{row.sites?.site_name ?? "—"}</div>
      <div className="text-xs text-muted-foreground">{row.sites?.postcode ?? ""}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <Card className="p-8 text-center space-y-2">
      <Icon className="h-7 w-7 mx-auto text-muted-foreground" />
      <div className="text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}

export default function WpPreConTab() {
  const { id: wpId } = useParams<{ id: string }>();

  const permits = useWpTable(wpId, "permits");
  const rams = useWpTable(wpId, "rams_documents");
  const tm = useWpTable(wpId, "traffic_management_plans");
  const logs = useWpTable(wpId, "daily_logs");
  const inspections = useWpTable(wpId, "inspections");
  const deliveries = useWpTable(wpId, "materials_deliveries");

  const counts = {
    permits: permits.data?.length ?? 0,
    rams: rams.data?.length ?? 0,
    tm: tm.data?.length ?? 0,
    logs: logs.data?.length ?? 0,
    inspections: inspections.data?.length ?? 0,
    deliveries: deliveries.data?.length ?? 0,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pre-Construction</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Permits, RAMS, traffic management, daily logs, inspections and materials deliveries —
            mobilisation readiness per site.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 7</Badge>
      </div>

      <Tabs defaultValue="permits" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="permits"><FileCheck2 className="h-3.5 w-3.5 mr-1" /> Permits ({counts.permits})</TabsTrigger>
          <TabsTrigger value="rams"><ShieldCheck className="h-3.5 w-3.5 mr-1" /> RAMS ({counts.rams})</TabsTrigger>
          <TabsTrigger value="tm"><TrafficCone className="h-3.5 w-3.5 mr-1" /> TM plans ({counts.tm})</TabsTrigger>
          <TabsTrigger value="logs"><ClipboardList className="h-3.5 w-3.5 mr-1" /> Daily logs ({counts.logs})</TabsTrigger>
          <TabsTrigger value="inspections"><SearchCheck className="h-3.5 w-3.5 mr-1" /> Inspections ({counts.inspections})</TabsTrigger>
          <TabsTrigger value="deliveries"><Package className="h-3.5 w-3.5 mr-1" /> Deliveries ({counts.deliveries})</TabsTrigger>
        </TabsList>

        <TabsContent value="permits" className="mt-3">
          {counts.permits === 0 ? (
            <EmptyState icon={FileCheck2} label="No permits recorded for this WP." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Reference</TableHead><TableHead>Type</TableHead><TableHead>Site</TableHead>
                  <TableHead>Authority</TableHead><TableHead>Valid</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(permits.data as any[]).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.reference ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.permit_type ?? "—"}</TableCell>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-sm">{r.authority ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.valid_from ?? "—"} → {r.expiry_date ?? "—"}
                      </TableCell>
                      <TableCell><StatusBadge value={r.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rams" className="mt-3">
          {counts.rams === 0 ? (
            <EmptyState icon={ShieldCheck} label="No RAMS documents for this WP." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Title</TableHead><TableHead>Version</TableHead><TableHead>Site</TableHead>
                  <TableHead>Valid</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(rams.data as any[]).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.title ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.version ?? "—"}</TableCell>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.valid_from ?? "—"} → {r.valid_to ?? "—"}
                      </TableCell>
                      <TableCell><StatusBadge value={r.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tm" className="mt-3">
          {counts.tm === 0 ? (
            <EmptyState icon={TrafficCone} label="No traffic-management plans for this WP." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Reference</TableHead><TableHead>Type</TableHead><TableHead>Site</TableHead>
                  <TableHead>Authority</TableHead><TableHead>Contractor</TableHead>
                  <TableHead>Valid</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(tm.data as any[]).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.reference ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.tm_type ?? "—"}</TableCell>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-sm">{r.authority ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.contractor ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.valid_from ?? "—"} → {r.valid_to ?? "—"}
                      </TableCell>
                      <TableCell><StatusBadge value={r.approval_state} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="logs" className="mt-3">
          {counts.logs === 0 ? (
            <EmptyState icon={ClipboardList} label="No daily logs recorded." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Site</TableHead>
                  <TableHead>Crew</TableHead><TableHead>Hours</TableHead>
                  <TableHead>Weather</TableHead><TableHead>Work done</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(logs.data as any[]).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.log_date ?? "—"}</TableCell>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-sm">{r.crew_count ?? "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums">{r.hours_worked ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.weather ?? "—"}{r.temperature_c != null ? ` · ${r.temperature_c}°C` : ""}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">{r.work_done ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="inspections" className="mt-3">
          {counts.inspections === 0 ? (
            <EmptyState icon={SearchCheck} label="No inspections logged." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Type</TableHead><TableHead>Site</TableHead>
                  <TableHead>Inspector</TableHead><TableHead>When</TableHead>
                  <TableHead>Result</TableHead><TableHead>Follow-up</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(inspections.data as any[]).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.inspection_type ?? "—"}</TableCell>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-sm">{r.inspector_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.inspected_at ? new Date(r.inspected_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell><StatusBadge value={r.result} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.followup_required ? (r.followup_due ? `Due ${r.followup_due}` : "Required") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="deliveries" className="mt-3">
          {counts.deliveries === 0 ? (
            <EmptyState icon={Package} label="No materials deliveries recorded." />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Item</TableHead><TableHead>Site</TableHead>
                  <TableHead>Qty</TableHead><TableHead>Supplier</TableHead>
                  <TableHead>Delivered</TableHead><TableHead>Delivery note</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(deliveries.data as any[]).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.item ?? "—"}</TableCell>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-sm tabular-nums">{r.qty ?? "—"}{r.uom ? ` ${r.uom}` : ""}</TableCell>
                      <TableCell className="text-sm">{r.supplier ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.delivered_at ? new Date(r.delivered_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{r.delivery_note_ref ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}