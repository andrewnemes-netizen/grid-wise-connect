import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function WpSiteRegisterTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["wp-site-register", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_sites")
        .select(`
          id, sequence, local_ref, site_id,
          sites:sites(id, site_name, postcode, viability_index, updated_at, current_stage_id, primary_partner_id)
        `)
        .eq("work_package_id", wpId!)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const siteIds = useMemo(() => rows.map((r: any) => r.site_id).filter(Boolean), [rows]);

  const { data: precon = [] } = useQuery({
    queryKey: ["wp-site-precon-status", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_wp_site_precon_status")
        .select("*")
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const preconBySite = new Map<string, any>((precon as any[]).map((p) => [p.site_id, p]));

  const { data: partners = [] } = useQuery({
    queryKey: ["wp-site-partners", wpId, siteIds.join(",")],
    enabled: siteIds.length > 0,
    queryFn: async () => {
      const partnerIds = Array.from(new Set(rows.map((r: any) => r.sites?.primary_partner_id).filter(Boolean))) as string[];
      if (partnerIds.length === 0) return [];
      const { data, error } = await supabase.from("partners").select("id, name").in("id", partnerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["stage-defs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stage_definitions").select("id, label");
      if (error) throw error;
      return data ?? [];
    },
  });

  const partnerById = new Map(partners.map((p: any) => [p.id, p]));
  const stageById = new Map(stages.map((s: any) => [s.id, s]));

  const filtered = rows.filter((r: any) => {
    if (!q.trim()) return true;
    const s = r.sites;
    const hay = [s?.site_name, s?.postcode, r.local_ref].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Site Register</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Every site in scope for this WP with stage, partner and viability. Click a row to open the site detail.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, postcode, ref" className="pl-8 h-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Viability</TableHead>
                <TableHead>POC</TableHead>
                <TableHead>Offer</TableHead>
                <TableHead>Estimate</TableHead>
                <TableHead>Survey</TableHead>
                <TableHead>EV design</TableHead>
                <TableHead>ICP design</TableHead>
                <TableHead>RAMS</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={16}><Skeleton className="h-5 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={16} className="text-center text-muted-foreground py-8">
                    {rows.length === 0 ? "No sites allocated to this work package yet." : "No sites match your search."}
                  </TableCell>
                </TableRow>
              ) : filtered.map((r: any, idx: number) => {
                const s = r.sites;
                const partner = s?.primary_partner_id ? partnerById.get(s.primary_partner_id) : null;
                const stage = s?.current_stage_id ? stageById.get(s.current_stage_id) : null;
                const pc = s?.id ? preconBySite.get(s.id) : null;
                const dash = <span className="text-muted-foreground text-xs">—</span>;
                const laneBadge = (val?: string | null) =>
                  val ? <Badge variant="outline" className="text-[10px]">{val}</Badge> : dash;
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => {
                    if (s?.id) window.open(`/site/${s.id}`, "_blank");
                  }}>
                    <TableCell className="text-muted-foreground tabular-nums text-xs">{r.sequence ?? idx + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/site/${s?.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {s?.site_name ?? "Site"}
                      </Link>
                      {r.local_ref && <span className="text-[11px] text-muted-foreground ml-2">{r.local_ref}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s?.postcode ?? "—"}</TableCell>
                    <TableCell>
                      {stage ? <Badge variant="secondary" className="text-[10px]">{(stage as any).label}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">{(partner as any)?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s?.viability_index != null ? (
                        <Badge variant={s.viability_index >= 70 ? "default" : s.viability_index >= 40 ? "secondary" : "destructive"}>
                          {s.viability_index}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>{laneBadge(pc?.poc_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.latest_offer_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.estimate_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.survey_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.ev_design_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.icp_design_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.rams_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.final_review_state)}</TableCell>
                    <TableCell className="text-xs">
                      {pc?.next_action_label ? (
                        <span>
                          {pc.next_action_label}
                          {pc.next_action_due && (
                            <span className="text-muted-foreground ml-1">· {pc.next_action_due}</span>
                          )}
                        </span>
                      ) : pc?.blocker_reason ? (
                        <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                      ) : dash}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s?.updated_at ? formatDistanceToNow(new Date(s.updated_at), { addSuffix: true }) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{filtered.length} of {rows.length} sites shown.</p>
      )}
    </div>
  );
}