import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Plus, Trash2, Clock, UserCheck, UserX } from "lucide-react";
import { format } from "date-fns";

const ROLES = ["admin", "engineer", "client"] as const;

export function UserRolesManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addingRoleFor, setAddingRoleFor] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");

  // Fetch all profiles (admin policy allows this)
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
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
      // Update request status
      const { error: updateErr } = await supabase
        .from("role_requests")
        .update({ status: action, resolved_at: new Date().toISOString() })
        .eq("id", requestId);
      if (updateErr) throw updateErr;

      // If approved, add the role
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

  // Get profile for a role request
  const getProfileName = (userId: string) => {
    const entry = userMap.get(userId);
    return entry?.profile?.full_name || userId.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      {/* Pending Role Requests */}
      {roleRequests.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
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
                          className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
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
                <TableHead>Joined</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profilesLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                </TableRow>
              ) : userMap.size === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users found</TableCell>
                </TableRow>
              ) : (
                Array.from(userMap.entries()).map(([uid, { profile, roles: userRoles }]) => (
                  <TableRow key={uid}>
                    <TableCell className="font-medium">{profile?.full_name || uid.slice(0, 8)}</TableCell>
                    <TableCell className="text-muted-foreground">{profile?.company || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {profile?.created_at ? format(new Date(profile.created_at), "dd MMM yyyy") : "—"}
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setAddingRoleFor(uid)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Role
                        </Button>
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
