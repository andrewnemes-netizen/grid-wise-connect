import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Undo2, Trash2, Archive } from "lucide-react";

export default function ArchiveConsole() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"archived" | "restored" | "purged">("archived");

  const { data, isLoading } = useQuery({
    queryKey: ["archive-list", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deleted_entities")
        .select("*")
        .eq("status", filter)
        .order("archived_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("restore_entity", { _archive_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entity restored"); qc.invalidateQueries({ queryKey: ["archive-list"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Restore failed"),
  });

  const purge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("purge_entity", { _archive_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entity permanently deleted"); qc.invalidateQueries({ queryKey: ["archive-list"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Purge failed"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Archive className="h-5 w-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Archive Console</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Sites, Work Packages and Programmes moved here are snapshot and retained for 90 days.
        Restore reinstates the record with its original ID. Delete Forever is irreversible.
      </p>
      <div className="flex gap-2">
        {(["archived", "restored", "purged"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
                  className="capitalize" onClick={() => setFilter(f)}>
            {f}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Archived entities</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Archived</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No records.</TableCell></TableRow>
              )}
              {(data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{r.entity_type}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{String(r.entity_id).slice(0, 8)}</TableCell>
                  <TableCell className="max-w-[240px] truncate" title={r.reason}>{r.reason}</TableCell>
                  <TableCell className="text-xs">{formatDistanceToNow(new Date(r.archived_at))} ago</TableCell>
                  <TableCell className="text-xs">
                    {r.status === "archived"
                      ? `expires ${new Date(r.retention_expires_at).toLocaleDateString()}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {r.status === "archived" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)}
                                disabled={restore.isPending}>
                          <Undo2 className="h-3 w-3 mr-1" /> Restore
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => {
                          if (confirm("Permanently delete this record? This cannot be undone.")) purge.mutate(r.id);
                        }} disabled={purge.isPending}>
                          <Trash2 className="h-3 w-3 mr-1" /> Delete Forever
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}