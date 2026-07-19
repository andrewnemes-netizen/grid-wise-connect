import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Shield, Plus, X } from "lucide-react";

const CAPABILITIES = [
  "site.move",
  "site.bulk_move",
  "entity.archive",
  "entity.restore",
  "entity.delete_forever",
] as const;

export default function CapabilityGrantsConsole() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const users = useQuery({
    queryKey: ["cap-users", q],
    queryFn: async () => {
      let query = supabase.from("profiles").select("id, email, full_name").order("email").limit(200);
      if (q.trim()) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const grants = useQuery({
    queryKey: ["cap-grants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("capability_grants").select("id, user_id, capability");
      if (error) throw error;
      return data ?? [];
    },
  });

  const byUser = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const g of grants.data ?? []) {
      (m[g.user_id] ??= new Set()).add(g.capability);
    }
    return m;
  }, [grants.data]);

  const grant = useMutation({
    mutationFn: async ({ user_id, capability }: { user_id: string; capability: string }) => {
      const { error } = await supabase.from("capability_grants").insert({ user_id, capability });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Capability granted"); qc.invalidateQueries({ queryKey: ["cap-grants"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Grant failed"),
  });

  const revoke = useMutation({
    mutationFn: async ({ user_id, capability }: { user_id: string; capability: string }) => {
      const { error } = await supabase.from("capability_grants").delete()
        .eq("user_id", user_id).eq("capability", capability);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Capability revoked"); qc.invalidateQueries({ queryKey: ["cap-grants"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Revoke failed"),
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Capability Grants</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Grant fine-grained capabilities to users without altering their base role. Admins receive all
        capabilities automatically; grants here supplement or override for non-admin users.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
          <Input placeholder="Search by email or name…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                {CAPABILITIES.map((c) => <TableHead key={c} className="text-center whitespace-nowrap">{c}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users.data ?? []).map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  {CAPABILITIES.map((cap) => {
                    const has = byUser[u.id]?.has(cap);
                    return (
                      <TableCell key={cap} className="text-center">
                        {has ? (
                          <Button size="sm" variant="ghost" className="h-7 gap-1"
                            onClick={() => revoke.mutate({ user_id: u.id, capability: cap })}>
                            <Badge className="bg-green-600 text-white">granted</Badge>
                            <X className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7"
                            onClick={() => grant.mutate({ user_id: u.id, capability: cap })}>
                            <Plus className="h-3 w-3 mr-1" /> grant
                          </Button>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {(users.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={CAPABILITIES.length + 1} className="text-center text-muted-foreground py-8">No users match</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}