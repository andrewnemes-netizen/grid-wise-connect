import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Zap, FileCheck2, AlertTriangle, PackageCheck } from "lucide-react";
import { useSitesMap, attachSites } from "./_useSitesMap";

function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return <Badge variant="outline">—</Badge>;
  const v = String(value).toLowerCase();
  const cls =
    ["complete", "closed", "signed", "energised", "commissioned", "valid", "issued", "resolved"].includes(v)
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
      : ["pending", "in_progress", "in_review", "draft", "open", "raised"].includes(v)
      ? "bg-sky-500/15 text-sky-600 border-sky-500/30"
      : ["failed", "rejected", "expired", "overdue", "critical", "high"].includes(v)
      ? "bg-rose-500/15 text-rose-600 border-rose-500/30"
      : ["medium", "warning"].includes(v)
      ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
      : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={cls}>{value}</Badge>;
}

function useWp(table: string, wpId?: string, select = "*") {
  return useQuery({
    queryKey: ["wp-commissioning", table, wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select(select)
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

export default function WpCommissioningTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const comm = useWp("commissioning_records", wpId);
  const certs = useWp("test_certificates", wpId);
  const snags = useWp("snagging_items", wpId);
  const packs = useWp("handover_packs", wpId);

  const allIds = [
    ...(comm.data ?? []),
    ...(certs.data ?? []),
    ...(snags.data ?? []),
    ...(packs.data ?? []),
  ].map((r: any) => r.site_id);
  const sitesMap = useSitesMap(allIds);
  const commRows = attachSites((comm.data ?? []) as any[], sitesMap);
  const certRows = attachSites((certs.data ?? []) as any[], sitesMap);
  const snagRows = attachSites((snags.data ?? []) as any[], sitesMap);
  const packRows = attachSites((packs.data ?? []) as any[], sitesMap);

  const c = {
    comm: comm.data?.length ?? 0,
    certs: certs.data?.length ?? 0,
    snags: snags.data?.length ?? 0,
    packs: packs.data?.length ?? 0,
  };

  const openSnags = ((snags.data ?? []) as any[]).filter((s) => !["closed", "resolved"].includes(String(s.status).toLowerCase())).length;
  const energised = ((comm.data ?? []) as any[]).filter((r) => !!r.energised_at).length;
  const handoverSigned = ((packs.data ?? []) as any[]).filter((p) => !!p.client_signed_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commissioning</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Energisation, test certificates, snagging and client handover packs — close-out gate for every site in this Work Package.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 11</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Energised sites</div><div className="text-xl font-semibold">{energised}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Certificates</div><div className="text-xl font-semibold">{c.certs}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Open snags</div><div className="text-xl font-semibold">{openSnags}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Handover signed</div><div className="text-xl font-semibold">{handoverSigned}/{c.packs}</div></Card>
      </div>

      <Tabs defaultValue="commissioning" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="commissioning"><Zap className="h-3.5 w-3.5 mr-1" /> Records ({c.comm})</TabsTrigger>
          <TabsTrigger value="certs"><FileCheck2 className="h-3.5 w-3.5 mr-1" /> Certificates ({c.certs})</TabsTrigger>
          <TabsTrigger value="snags"><AlertTriangle className="h-3.5 w-3.5 mr-1" /> Snagging ({c.snags})</TabsTrigger>
          <TabsTrigger value="packs"><PackageCheck className="h-3.5 w-3.5 mr-1" /> Handover ({c.packs})</TabsTrigger>
        </TabsList>

        <TabsContent value="commissioning" className="mt-3">
          {c.comm === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No commissioning records yet.</Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Site</TableHead><TableHead>MPAN</TableHead><TableHead>Meter</TableHead>
                  <TableHead>Capacity</TableHead><TableHead>Voltage</TableHead>
                  <TableHead>Energised</TableHead><TableHead>Commissioned</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {commRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-xs font-mono">{r.mpan ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{r.meter_serial ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.connection_capacity_kva ? `${r.connection_capacity_kva} kVA` : "—"}</TableCell>
                      <TableCell className="text-sm">{r.voltage_level ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.energised_at ? new Date(r.energised_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.commissioned_at ? new Date(r.commissioned_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell><StatusBadge value={r.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="certs" className="mt-3">
          {c.certs === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No test certificates issued.</Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Number</TableHead><TableHead>Type</TableHead><TableHead>Site</TableHead>
                  <TableHead>Issued by</TableHead><TableHead>Issued</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {certRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.cert_number ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.cert_type ?? "—"}</TableCell>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-sm">{r.issued_by ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.issued_at ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.expires_at ?? "—"}</TableCell>
                      <TableCell><StatusBadge value={r.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="snags" className="mt-3">
          {c.snags === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No snagging items raised.</Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Title</TableHead><TableHead>Site</TableHead><TableHead>Severity</TableHead>
                  <TableHead>Raised</TableHead><TableHead>Target close</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {snagRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium max-w-xs truncate">{r.title ?? "—"}</TableCell>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell><StatusBadge value={r.severity} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.raised_at ? new Date(r.raised_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.target_close_date ?? "—"}</TableCell>
                      <TableCell><StatusBadge value={r.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="packs" className="mt-3">
          {c.packs === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No handover packs yet.</Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Site</TableHead><TableHead>PC signed</TableHead><TableHead>Client signed</TableHead>
                  <TableHead>Warranty start</TableHead><TableHead>Warranty (mo)</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {packRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><SiteCell row={r} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.pc_signed_at ? `${new Date(r.pc_signed_at).toLocaleDateString()} · ${r.pc_signed_by_name ?? ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.client_signed_at ? `${new Date(r.client_signed_at).toLocaleDateString()} · ${r.client_signed_by_name ?? ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.warranty_start_date ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.warranty_period_months ?? "—"}</TableCell>
                      <TableCell><StatusBadge value={r.status} /></TableCell>
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