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
import { useAuth } from "@/hooks/useAuth";
import { Plus, Building2, UserPlus, Trash2, Users } from "lucide-react";
import { format } from "date-fns";

function CreateUserDialog({ orgId, orgName, onSuccess }: { orgId: string; orgName: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("client");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("create-org-user", {
        body: { email, password, full_name: fullName, company, org_id: orgId, role },
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: "User created", description: `${email} added to ${orgName}` });
      setEmail(""); setPassword(""); setFullName(""); setCompany(""); setRole("client");
      setOpen(false);
      onSuccess();
    } catch (e: any) {
      toast({ title: "Error creating user", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><UserPlus className="h-4 w-4 mr-1" />Create User</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New User for {orgName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Smith" />
          </div>
          <div className="space-y-1">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" />
          </div>
          <div className="space-y-1">
            <Label>Password *</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div className="space-y-1">
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="engineer">Engineer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" disabled={!email || !password || password.length < 6 || loading} onClick={handleCreate}>
            {loading ? "Creating…" : "Create User & Assign to Organisation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OrgManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId: myOrgId, isPlatformAdmin } = useAuth();
  const isSuperAdmin = isPlatformAdmin;
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<"client" | "partner" | "internal" | "other">("client");
  const [orgTypeOther, setOrgTypeOther] = useState("");
  const [editingOrg, setEditingOrg] = useState<any | null>(null);
  const [addMemberOrgId, setAddMemberOrgId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ["admin-organisations", myOrgId],
    queryFn: async () => {
      let q = supabase.from("organisations").select("*").order("name");
      if (!isPlatformAdmin && myOrgId) q = q.eq("id", myOrgId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["admin-org-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_members").select("*").order("created_at");
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

  // Partner-specific extra fields (contractor sub-type, status, contact)
  // live in the separate `partners` table, keyed by org_id — the
  // Organisations page is the only place that manages them now.
  const { data: partnersByOrg = [] } = useQuery({
    queryKey: ["admin-partners-by-org"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("*");
      if (error) throw error;
      return data;
    },
  });
  const getPartnerForOrg = (orgId: string) => (partnersByOrg as any[]).find((p) => p.org_id === orgId);

  const [partnerSubType, setPartnerSubType] = useState("contractor");
  const [partnerStatus, setPartnerStatus] = useState("active");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerNotes, setPartnerNotes] = useState("");
  const resetPartnerFields = () => {
    setPartnerSubType("contractor"); setPartnerStatus("active"); setPartnerEmail(""); setPartnerNotes("");
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-organisations"] });
    qc.invalidateQueries({ queryKey: ["admin-org-members"] });
    qc.invalidateQueries({ queryKey: ["admin-profiles-for-orgs"] });
    qc.invalidateQueries({ queryKey: ["admin-partners-by-org"] });
  };

  const createOrg = useMutation({
    mutationFn: async () => {
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const payload: any = {
        name: orgName,
        slug,
        org_type: orgType,
        org_type_other: orgType === "other" ? orgTypeOther.trim() : null,
      };
      const { data: org, error } = await supabase.from("organisations").insert(payload).select("id").single();
      if (error) throw error;

      if (orgType === "partner") {
        const { error: pErr } = await supabase.from("partners").insert({
          org_id: (org as any).id,
          name: orgName,
          type: partnerSubType,
          status: partnerStatus,
          primary_contact_email: partnerEmail || null,
          notes: partnerNotes || null,
        });
        if (pErr) throw pErr;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setCreateOpen(false);
      setOrgName("");
      setOrgType("client");
      setOrgTypeOther("");
      resetPartnerFields();
      toast({ title: "Organisation created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateOrgType = useMutation({
    mutationFn: async () => {
      if (!editingOrg) return;
      const payload: any = {
        org_type: orgType,
        org_type_other: orgType === "other" ? orgTypeOther.trim() : null,
      };
      const { error } = await (supabase as any).from("organisations").update(payload).eq("id", editingOrg.id);
      if (error) throw error;

      // Switching an existing org to Partner type: give it a partners
      // row if it doesn't already have one, so the extra fields show up.
      if (orgType === "partner" && !getPartnerForOrg(editingOrg.id)) {
        const { error: pErr } = await supabase.from("partners").insert({
          org_id: editingOrg.id,
          name: editingOrg.name,
          type: partnerSubType,
          status: partnerStatus,
          primary_contact_email: partnerEmail || null,
          notes: partnerNotes || null,
        });
        if (pErr) throw pErr;
      }
    },
    onSuccess: () => {
      invalidateAll();
      setEditingOrg(null);
      resetPartnerFields();
      toast({ title: "Organisation updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addMember = useMutation({
    mutationFn: async ({ orgId, userId }: { orgId: string; userId: string }) => {
      const { error } = await supabase.from("org_members").insert({ org_id: orgId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); setAddMemberOrgId(null); setSelectedUserId(""); toast({ title: "Member added" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Member removed" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteOrg = useMutation({
    mutationFn: async (id: string) => {
      const linkedPartner = getPartnerForOrg(id);
      if (linkedPartner) {
        const { error: pErr } = await supabase.from("partners").delete().eq("id", linkedPartner.id);
        if (pErr) throw pErr;
      }
      const { error } = await supabase.from("organisations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Organisation deleted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getProfileName = (userId: string) => {
    const p = profiles.find((p: any) => p.user_id === userId);
    return p?.full_name || userId.slice(0, 8);
  };

  const getOrgMembers = (orgId: string) => members.filter((m: any) => m.org_id === orgId);

  const orgTypeLabel = (o: any) =>
    o.org_type === "other"
      ? o.org_type_other || "Other"
      : (o.org_type ?? "client").charAt(0).toUpperCase() + (o.org_type ?? "client").slice(1);
  const orgTypeBadgeVariant = (t: string): "default" | "secondary" | "outline" =>
    t === "internal" ? "default" : t === "client" ? "secondary" : "outline";

  const canSaveType = orgType !== "other" || orgTypeOther.trim().length > 0;

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
        {isSuperAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Organisation</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Organisation</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Organisation Name</Label>
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Acme Energy Ltd" />
                </div>
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select value={orgType} onValueChange={(v) => setOrgType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                      <SelectItem value="internal">Internal (EcoPower staff)</SelectItem>
                      <SelectItem value="other">Other…</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Internal orgs give every member access to Programme &amp; Work Package pickers.
                  </p>
                </div>
                {orgType === "other" && (
                  <div className="space-y-2">
                    <Label>Type label *</Label>
                    <Input
                      value={orgTypeOther}
                      onChange={(e) => setOrgTypeOther(e.target.value)}
                      placeholder="e.g. Supplier, DNO, Local Authority"
                    />
                  </div>
                )}
                {orgType === "partner" && (
                  <div className="space-y-4 rounded-md border p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Partner Type</Label>
                        <Select value={partnerSubType} onValueChange={setPartnerSubType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contractor">Contractor</SelectItem>
                            <SelectItem value="icp">ICP</SelectItem>
                            <SelectItem value="idno">IDNO</SelectItem>
                            <SelectItem value="consultant">Consultant</SelectItem>
                            <SelectItem value="supplier">Supplier</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={partnerStatus} onValueChange={setPartnerStatus}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Primary Contact Email</Label>
                      <Input type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} placeholder="contact@partner.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Input value={partnerNotes} onChange={(e) => setPartnerNotes(e.target.value)} placeholder="Optional" />
                    </div>
                  </div>
                )}
                <Button className="w-full" disabled={!orgName.trim() || !canSaveType} onClick={() => createOrg.mutate()}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Edit type dialog (shared for all rows) */}
      <Dialog open={!!editingOrg} onOpenChange={(open) => { if (!open) setEditingOrg(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change type — {editingOrg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={orgType} onValueChange={(v) => setOrgType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="internal">Internal (EcoPower staff)</SelectItem>
                  <SelectItem value="other">Other…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {orgType === "other" && (
              <div className="space-y-2">
                <Label>Type label *</Label>
                <Input value={orgTypeOther} onChange={(e) => setOrgTypeOther(e.target.value)} placeholder="e.g. Supplier" />
              </div>
            )}
            {orgType === "partner" && editingOrg && !getPartnerForOrg(editingOrg.id) && (
              <div className="space-y-4 rounded-md border p-3">
                <p className="text-[11px] text-muted-foreground">
                  This org doesn't have partner details yet — set them up now.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Partner Type</Label>
                    <Select value={partnerSubType} onValueChange={setPartnerSubType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="icp">ICP</SelectItem>
                        <SelectItem value="idno">IDNO</SelectItem>
                        <SelectItem value="consultant">Consultant</SelectItem>
                        <SelectItem value="supplier">Supplier</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={partnerStatus} onValueChange={setPartnerStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Primary Contact Email</Label>
                  <Input type="email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} placeholder="contact@partner.com" />
                </div>
              </div>
            )}
            <Button className="w-full" disabled={!canSaveType} onClick={() => updateOrgType.mutate()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

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
                    <Badge variant={orgTypeBadgeVariant(org.org_type ?? "client")} className="text-[10px] uppercase">
                      {orgTypeLabel(org)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{orgMembers.length} members</Badge>
                  </CardTitle>
                  <div className="flex gap-1 flex-wrap">                    <CreateUserDialog orgId={org.id} orgName={org.name} onSuccess={invalidateAll} />
                    {isSuperAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingOrg(org);
                          setOrgType(((org.org_type ?? "client") as any));
                          setOrgTypeOther(org.org_type_other ?? "");
                        }}
                      >
                        Change type
                      </Button>
                    )}
                    <Dialog open={addMemberOrgId === org.id} onOpenChange={(open) => { setAddMemberOrgId(open ? org.id : null); setSelectedUserId(""); }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm"><Users className="h-4 w-4 mr-1" />Existing User</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Existing User to {org.name}</DialogTitle></DialogHeader>
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
                          <Button className="w-full" disabled={!selectedUserId} onClick={() => addMember.mutate({ orgId: org.id, userId: selectedUserId })}>Add</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    {isSuperAdmin && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteOrg.mutate(org.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {org.org_type === "partner" && (() => {
                  const p = getPartnerForOrg(org.id);
                  return p ? (
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] capitalize">{p.type}</Badge>
                      <Badge variant="outline" className={`text-[10px] capitalize ${p.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : ""}`}>{p.status}</Badge>
                      {p.primary_contact_email && <span>{p.primary_contact_email}</span>}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-xs text-amber-600">No partner details set — use "Change type" to add them.</div>
                  );
                })()}
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
