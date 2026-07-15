import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText, Filter } from "lucide-react";

function actionColor(action: string) {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("reject")) return "bg-rose-500/15 text-rose-600 border-rose-500/30";
  if (a.includes("create") || a.includes("insert")) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  if (a.includes("update") || a.includes("change") || a.includes("transition")) return "bg-sky-500/15 text-sky-600 border-sky-500/30";
  return "bg-muted text-muted-foreground";
}

export default function WpAuditTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("all");

  const siteIds = useQuery({
    queryKey: ["wp-site-ids-audit", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites").select("site_id, sites(site_name)").eq("work_package_id", wpId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const siteNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (siteIds.data ?? []).forEach((r: any) => { if (r.sites?.site_name) map[r.site_id] = r.sites.site_name; });
    return map;
  }, [siteIds.data]);

  const events = useQuery({
    queryKey: ["wp-audit", wpId, siteIds.data?.length],
    enabled: !!wpId && !!siteIds.data,
    queryFn: async () => {
      const ids = (siteIds.data ?? []).map((r: any) => r.site_id as string);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .in("site_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const actionOptions = useMemo(() => {
    const s = new Set<string>();
    ((events.data ?? []) as any[]).forEach((e) => e.action && s.add(e.action));
    return Array.from(s).sort();
  }, [events.data]);

  const filtered = useMemo(() => {
    return ((events.data ?? []) as any[]).filter((e) => {
      if (action !== "all" && e.action !== action) return false;
      if (q) {
        const hay = `${e.action ?? ""} ${JSON.stringify(e.meta_json ?? {})}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [events.data, q, action]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Immutable event stream for every action against sites in this Work Package.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 2</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search action or metadata…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Button size="sm" variant={action === "all" ? "default" : "outline"} onClick={() => setAction("all")}>All</Button>
        {actionOptions.slice(0, 8).map((a) => (
          <Button key={a} size="sm" variant={action === a ? "default" : "outline"} onClick={() => setAction(a)}>{a}</Button>
        ))}
      </div>

      {events.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading audit trail…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <ScrollText className="h-7 w-7 mx-auto text-muted-foreground" />
          <div className="text-sm text-muted-foreground">No audit events for this WP yet.</div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ol className="divide-y">
            {filtered.map((e: any) => (
              <li key={e.id} className="p-3 flex gap-3 items-start">
                <div className="text-[11px] text-muted-foreground w-32 shrink-0 tabular-nums">
                  {new Date(e.created_at).toLocaleString()}
                </div>
                <Badge variant="outline" className={actionColor(e.action ?? "")}>{e.action}</Badge>
                <div className="text-sm min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">
                    {siteNameById[e.site_id] ?? e.site_id?.slice(0, 8) ?? "—"}
                  </div>
                  {e.meta_json && Object.keys(e.meta_json).length > 0 && (
                    <pre className="text-[11px] mt-1 bg-muted/40 p-2 rounded overflow-x-auto max-w-full">
                      {JSON.stringify(e.meta_json, null, 2)}
                    </pre>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}