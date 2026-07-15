import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FlaskConical, ExternalLink } from "lucide-react";

function statusClass(s?: string) {
  switch (s) {
    case "final":
    case "locked":
      return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "draft":
      return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function WpGridStudiesTab() {
  const { id: wpId } = useParams<{ id: string }>();

  const { data: siteIds = [] } = useQuery({
    queryKey: ["wp-site-ids", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites").select("site_id").eq("work_package_id", wpId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.site_id);
    },
  });

  const { data: studies = [], isLoading } = useQuery({
    queryKey: ["wp-studies", wpId, siteIds.join(",")],
    enabled: !!wpId,
    queryFn: async () => {
      const orParts = [`wp_id.eq.${wpId}`];
      if (siteIds.length > 0) orParts.push(`site_id.in.(${siteIds.join(",")})`);
      const { data, error } = await supabase
        .from("studies")
        .select("id,study_name,mode,status,workflow_status,dno,voltage_level,proposed_kw,updated_at,site_id,sites(site_name,postcode)")
        .or(orParts.join(","))
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Grid Studies</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Gridwise Connect study snapshots for every site in this WP. Click a study to open its
            immutable, version-locked assessment.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 2</Badge>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading studies…</Card>
      ) : studies.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">No studies yet</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Studies raised in Gridwise Connect against sites in this work package will appear here.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/studies">Open Studies</Link>
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Study</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>DNO / voltage</TableHead>
                <TableHead className="text-right">kW</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(studies as any[]).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium max-w-xs truncate">{s.study_name ?? "(untitled)"}</TableCell>
                  <TableCell className="text-sm">
                    <div className="truncate">{s.sites?.site_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.sites?.postcode ?? ""}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{s.mode ?? "—"}</Badge></TableCell>
                  <TableCell className="text-sm">
                    {(s.dno ?? "—")}<span className="text-muted-foreground"> · {s.voltage_level ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.proposed_kw ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusClass(s.status)}>
                      {s.status ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Button asChild size="icon" variant="ghost">
                      <Link to={`/studies/${s.id}`}><ExternalLink className="h-4 w-4" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}