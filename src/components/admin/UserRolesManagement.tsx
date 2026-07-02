import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Plus, Clock, UserCheck, UserX, ShieldAlert, Phone, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";

const ROLES = ["admin", "engineer", "client"] as const;

export function UserRolesManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addingRoleFor, setAddingRoleFor] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");

  // Fetch app settings
  const { data: appSettings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  // Toggle approval requirement
  const toggleApproval = useMutation({
    mutationFn: async (require: boolean) => {
      const { error } = await supabase
        .from("app_settings")
        .update({ require_approval: require, updated_at: new Date().toISOString() })
        .eq("id", appSettings!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast({ title: "Setting updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Fetch all profiles (admin policy allows this)
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, company, avatar_url, created_at, updated_at, is_approved, is_platform_admin")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch all roles
  const { data: roles = [] } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch pending role requests
  const { data: roleRequests = [] } = useQuery({
    queryKey: ["admin-role-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Build user map
  const userMap = new Map<string, { profile: any; roles: string[] }>();
  for (const p of profiles) {
    userMap.set(p.user_id, { profile: p, roles: [] });
  }
  for (const r of roles) {
    const entry = userMap.get(r.user_id);
    if (entry) entry.roles.push(r.role);
  }

  // Approve user account
  const approveUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").update({ is_approved: true }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast({ title: "User approved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Revoke user approval
  const revokeUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").update({ is_approved: false }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast({ title: "User access revoked" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Add role mutation
  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      setAddingRoleFor(null);
      setSelectedRole("");
      toast({ title: "Role added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Remove role mutation
  const removeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast({ title: "Role removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Approve/reject role request
  const resolveRequest = useMutation({
    mutationFn: async ({ requestId, action, userId, role }: { requestId: string; action: "approved" | "rejected"; userId: string; role: string }) => {
      const { error: updateErr } = await supabase
        .from("role_requests")
        .update({ status: action, resolved_at: new Date().toISOString() })
        .eq("id", requestId);
      if (updateErr) throw updateErr;

      if (action === "approved") {
        const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
        if (roleErr && !roleErr.message.includes("duplicate")) throw roleErr;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-role-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast({ title: `Request ${vars.action}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast({ title: "User deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const getProfileName = (userId: string) => {
    const entry = userMap.get(userId);
    return entry?.profile?.full_name || userId.slice(0, 8);
  };

  const pendingUsers = profiles.filter((p: any) => !p.is_approved);

  return (
    <div className="space-y-4">
      {/* Approval Toggle */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <div>
                <Label className="text-sm font-medium">Require Account Approval</Label>
                <p className="text-xs text-muted-foreground">When enabled, new signups need admin approval before accessing the platform.</p>
              </div>
            </div>
            <Switch
              checked={appSettings?.require_approval ?? false}
              onCheckedChange={(checked) => toggleApproval.mutate(checked)}
              disabled={toggleApproval.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Pending Account Approvals */}
      {pendingUsers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Pending Account Approvals ({pendingUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Signed Up</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((p: any) => (
                  <TableRow key={p.user_id}>
                    <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.company || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.phone || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => approveUser.mutate(p.user_id)}
                        disabled={approveUser.isPending}
                      >
                        <UserCheck className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pending Role Requests */}
      {roleRequests.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              Pending Role Requests ({roleRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Requested Role</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roleRequests.map((req: any) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{getProfileName(req.user_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{req.requested_role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(req.created_at), "dd MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => resolveRequest.mutate({ requestId: req.id, action: "approved", userId: req.user_id, role: req.requested_role })}
                          disabled={resolveRequest.isPending}
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => resolveRequest.mutate({ requestId: req.id, action: "rejected", userId: req.user_id, role: req.requested_role })}
                          disabled={resolveRequest.isPending}
                        >
                          <UserX className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All Users */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profilesLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                </TableRow>
              ) : userMap.size === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users found</TableCell>
                </TableRow>
              ) : (
                Array.from(userMap.entries()).map(([uid, { profile, roles: userRoles }]) => (
                  <TableRow key={uid}>
                    <TableCell className="font-medium">{profile?.full_name || uid.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">{profile?.company || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{profile?.phone || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {profile?.created_at ? format(new Date(profile.created_at), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      {profile?.is_approved ? (
                        <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => revokeUser.mutate(uid)}>
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 cursor-pointer" onClick={() => approveUser.mutate(uid)}>
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {userRoles.map((r) => (
                          <Badge key={r} variant="outline" className="capitalize text-xs group">
                            {r}
                            <button
                              className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeRole.mutate({ userId: uid, role: r })}
                              title={`Remove ${r} role`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {userRoles.length === 0 && (
                          <span className="text-xs text-muted-foreground">No roles</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {addingRoleFor === uid ? (
                        <div className="flex items-center justify-end gap-1">
                          <Select value={selectedRole} onValueChange={setSelectedRole}>
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue placeholder="Role…" />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.filter((r) => !userRoles.includes(r)).map((r) => (
                                <SelectItem key={r} value={r} className="capitalize text-xs">{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            disabled={!selectedRole || addRole.isPending}
                            onClick={() => addRole.mutate({ userId: uid, role: selectedRole })}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => { setAddingRoleFor(null); setSelectedRole(""); }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                       ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setAddingRoleFor(uid)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Role
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Delete user"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete user?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove <strong>{profile?.full_name || uid.slice(0, 8)}</strong> and all their roles from the system. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteUser.mutate(uid)}
                                  disabled={deleteUser.isPending}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}