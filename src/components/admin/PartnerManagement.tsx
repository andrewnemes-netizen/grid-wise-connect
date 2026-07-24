import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus, Users, Link2 } from "lucide-react";

export function PartnerManagement() {
  return (
    <Tabs defaultValue="users" className="space-y-4">
      <TabsList>
        <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Partner Users</TabsTrigger>
        <TabsTrigger value="allocations"><Link2 className="h-3.5 w-3.5 mr-1.5" />WP Allocations</TabsTrigger>
      </TabsList>
      <TabsContent value="users"><PartnerUsersTab /></TabsContent>
      <TabsContent value="allocations"><AllocationsTab /></TabsContent>
    </Tabs>
  );
}

function PartnerUsersTab() {
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [role, setRole] = useState<string>("viewer");

  const { data: partners = [] } = useQuery({
    queryKey: ["admin-partners-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-profiles-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id,full_name,company").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["admin-partner-users", partnerId],
    queryFn: async () => {
      let q = supabase.from("partner_users").select("*").order("created_at", { ascending: false });
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const profileById = new Map(profiles.map((p: any) => [p.user_id, p]));
  const partnerById = new Map(partners.map((p: any) => [p.id, p]));

  const addLink = useMutation({
    mutationFn: async () => {
      if (!partnerId || !userId) throw new Error("Select a partner and user");
      const { error } = await supabase.from("partner_users").insert({ partner_id: partnerId, user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User linked");
      qc.invalidateQueries({ queryKey: ["admin-partner-users"] });
      setUserId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_users").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["admin-partner-users"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Partner Users</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <Label>Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {partners.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p: any) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || p.user_id.slice(0, 8)}{p.company ? ` — ${p.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="admin">Partner Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => addLink.mutate()} disabled={addLink.isPending}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : links.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No links{partnerId ? " for this partner" : ""}</TableCell></TableRow>
            ) : links.map((l: any) => {
              const prof: any = profileById.get(l.user_id);
              const partner: any = partnerById.get(l.partner_id);
              return (
                <TableRow key={l.id}>
                  <TableCell>{partner?.name || l.partner_id.slice(0, 8)}</TableCell>
                  <TableCell>{prof?.full_name || l.user_id.slice(0, 8)}</TableCell>
                  <TableCell><Badge variant="outline">{l.role}</Badge></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => {
                      if (confirm("Remove this partner user link?")) removeLink.mutate(l.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AllocationsTab() {
  const qc = useQueryClient();
  const [wpId, setWpId] = useState<string>("");
  const [partnerId, setPartnerId] = useState<string>("");
  const [siteId, setSiteId] = useState<string>("__all__");

  const { data: wps = [] } = useQuery({
    queryKey: ["admin-wps-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_packages").select("id,code,name").order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["admin-partners-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: wpSites = [] } = useQuery({
    queryKey: ["admin-wp-sites", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_sites")
        .select("site_id, sites:sites(id, site_name, postcode)")
        .eq("work_package_id", wpId);
      if (error) throw error;
      return data;
    },
  });

  const { data: allocations = [], isLoading } = useQuery({
    queryKey: ["admin-allocations", wpId],
    queryFn: async () => {
      let q = supabase.from("wp_partner_allocations").select("*").order("allocated_at", { ascending: false });
      if (wpId) q = q.eq("work_package_id", wpId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const wpById = new Map(wps.map((w: any) => [w.id, w]));
  const partnerById = new Map(partners.map((p: any) => [p.id, p]));

  const create = useMutation({
    mutationFn: async () => {
      if (!wpId || !partnerId) throw new Error("Select work package and partner");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("wp_partner_allocations").insert({
        work_package_id: wpId,
        partner_id: partnerId,
        site_id: siteId === "__all__" ? null : siteId,
        allocated_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Allocation added");
      qc.invalidateQueries({ queryKey: ["admin-allocations"] });
      setPartnerId("");
      setSiteId("__all__");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wp_partner_allocations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["admin-allocations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const siteById = new Map(wpSites.map((s: any) => [s.site_id, s.sites]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Work Package Partner Allocations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <Label>Work Package</Label>
            <Select value={wpId} onValueChange={(v) => { setWpId(v); setSiteId("__all__"); }}>
              <SelectTrigger><SelectValue placeholder="Select WP" /></SelectTrigger>
              <SelectContent>
                {wps.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {partners.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Site (optional)</Label>
            <Select value={siteId} onValueChange={setSiteId} disabled={!wpId}>
              <SelectTrigger><SelectValue placeholder="All sites in WP" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sites in WP</SelectItem>
                {wpSites.map((s: any) => (
                  <SelectItem key={s.site_id} value={s.site_id}>
                    {s.sites?.site_name || s.site_id.slice(0, 8)}{s.sites?.postcode ? ` — ${s.sites.postcode}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}><Plus className="h-4 w-4 mr-1" />Allocate</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Work Package</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : allocations.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No allocations{wpId ? " for this WP" : ""}</TableCell></TableRow>
            ) : allocations.map((a: any) => {
              const wp: any = wpById.get(a.work_package_id);
              const partner: any = partnerById.get(a.partner_id);
              const site: any = a.site_id ? siteById.get(a.site_id) : null;
              return (
                <TableRow key={a.id}>
                  <TableCell>{wp ? `${wp.code} — ${wp.name}` : a.work_package_id.slice(0, 8)}</TableCell>
                  <TableCell>{partner?.name || a.partner_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.site_id ? (site ? `Site: ${site.site_name}` : `Site: ${a.site_id.slice(0, 8)}`) : "All sites"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => {
                      if (confirm("Remove this allocation?")) remove.mutate(a.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}