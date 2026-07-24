import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Settings } from "lucide-react";
import { ScopeAwardsPanel } from "@/components/delivery/ScopeAwardsPanel";

export default function WpPartnersTab() {
  const { id: wpId } = useParams<{ id: string }>();

  const { data: allocations = [], isLoading } = useQuery({
    queryKey: ["wp-partner-allocations", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_partner_allocations")
        .select("id, partner_id, site_id, allocated_at, partners(id,name,type,status), sites(site_name,postcode)")
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { partner: any; sites: any[]; wpWide: boolean }>();
    (allocations as any[]).forEach((a) => {
      const key = a.partner_id;
      const cur = map.get(key) ?? { partner: a.partners, sites: [], wpWide: false };
      if (a.site_id) cur.sites.push({ site_id: a.site_id, ...a.sites });
      else cur.wpWide = true;
      map.set(key, cur);
    });
    return Array.from(map.entries());
  }, [allocations]);

  const partnerIds = grouped.map(([id]) => id);

  const { data: partnerUsers = [] } = useQuery({
    queryKey: ["wp-partner-users", partnerIds.join(",")],
    enabled: partnerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_users")
        .select("partner_id, user_id, role")
        .in("partner_id", partnerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const usersByPartner = useMemo(() => {
    const m = new Map<string, any[]>();
    (partnerUsers as any[]).forEach((u) => {
      const arr = m.get(u.partner_id) ?? [];
      arr.push(u); m.set(u.partner_id, arr);
    });
    return m;
  }, [partnerUsers]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partners</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Partners allocated to this WP, scope split (WP-wide vs specific sites) and portal user
            counts. Manage allocations from the admin console.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">Phase 3</Badge>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin"><Settings className="h-4 w-4 mr-1" /> Manage in admin</Link>
          </Button>
        </div>
      </div>

      {wpId && <ScopeAwardsPanel workPackageId={wpId} />}

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading partners…</Card>
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Users className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">No partners allocated</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Allocate partners to this work package (or its individual sites) from the admin console.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {grouped.map(([partnerId, entry]) => {
            const users = usersByPartner.get(partnerId) ?? [];
            return (
              <Card key={partnerId} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{entry.partner?.name ?? "Partner"}</div>
                      {entry.partner?.type && <Badge variant="outline" className="text-[10px]">{entry.partner.type}</Badge>}
                      {entry.partner?.status && <Badge variant="outline" className="text-[10px]">{entry.partner.status}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {entry.wpWide
                        ? "Scope: entire WP"
                        : `Scope: ${entry.sites.length} site${entry.sites.length === 1 ? "" : "s"}`}
                      {" · "}
                      {users.length} portal user{users.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Badge variant="outline" className={users.length > 0 ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                    {users.length > 0 ? "Portal active" : "No portal users"}
                  </Badge>
                </div>
                {!entry.wpWide && entry.sites.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {entry.sites.map((s: any) => (
                      <Badge key={s.site_id} variant="outline" className="text-[11px]">
                        {s.site_name ?? "Site"}{s.postcode ? ` · ${s.postcode}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}