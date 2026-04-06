import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, UserPlus, Trash2, Users } from "lucide-react";
import { format } from "date-fns";

export function OrgManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [addMemberOrgId, setAddMemberOrgId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["admin-organisations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisations")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["admin-org-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_members")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-profiles-for-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, company").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const createOrg = useMutation({
    mutationFn: async () => {
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const { error } = await supabase.from("organisations").insert({ name: orgName, slug });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-organisations"] });
      setCreateOpen(false);
      setOrgName("");
      toast({ title: "Organisation created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addMember = useMutation({
    mutationFn: async ({ orgId, userId }: { orgId: string; userId: string }) => {
      const { error } = await supabase.from("org_members").insert({ org_id: orgId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-org-members"] });
      setAddMemberOrgId(null);
      setSelectedUserId("");
      toast({ title: "Member added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-org-members"] });
      toast({ title: "Member removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteOrg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organisations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-organisations"] });
      qc.invalidateQueries({ queryKey: ["admin-org-members"] });
      toast({ title: "Organisation deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getProfileName = (userId: string) => {
    const p = profiles.find((p: any) => p.user_id === userId);
    return p?.full_name || userId.slice(0, 8);
  };

  const getOrgMembers = (orgId: string) => members.filter((m: any) => m.org_id === orgId);

  const unassignedUsers = profiles.filter(
    (p: any) => !members.some((m: any) => m.user_id === p.user_id)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Organisations</h3>
          <Badge variant="secondary">{orgs.length}</Badge>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Organisation</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organisation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Organisation Name</Label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Acme Energy Ltd" />
              </div>
              <Button className="w-full" disabled={!orgName.trim()} onClick={() => createOrg.mutate()}>
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : orgs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No organisations yet. Create one to start grouping client users.
          </CardContent>
        </Card>
      ) : (
        orgs.map((org: any) => {
          const orgMembers = getOrgMembers(org.id);
          return (
            <Card key={org.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {org.name}
                    <Badge variant="outline" className="text-xs">{orgMembers.length} members</Badge>
                  </CardTitle>
                  <div className="flex gap-1">
                    <Dialog open={addMemberOrgId === org.id} onOpenChange={(open) => { setAddMemberOrgId(open ? org.id : null); setSelectedUserId(""); }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm"><UserPlus className="h-4 w-4 mr-1" />Add Member</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Member to {org.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
                            <SelectContent>
                              {unassignedUsers.map((p: any) => (
                                <SelectItem key={p.user_id} value={p.user_id}>
                                  {p.full_name || p.user_id.slice(0, 8)} {p.company ? `(${p.company})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button className="w-full" disabled={!selectedUserId} onClick={() => addMember.mutate({ orgId: org.id, userId: selectedUserId })}>
                            Add
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteOrg.mutate(org.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {orgMembers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No members yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgMembers.map((m: any) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{getProfileName(m.user_id)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{m.role}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(new Date(m.created_at), "dd MMM yyyy")}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => removeMember.mutate(m.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}