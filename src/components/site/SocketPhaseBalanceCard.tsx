import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import { balancePhases, formatKw, type SocketGroup } from "@/lib/wp/socketPhaseBalance";

interface Props {
  siteId: string;
  canEdit?: boolean;
}

type DraftGroup = SocketGroup & { _new?: boolean };

export function SocketPhaseBalanceCard({ siteId, canEdit = true }: Props) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<DraftGroup[] | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["site-socket-groups", siteId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("site_socket_groups")
        .select("id, quantity, power_rating_kw, phases, sort_order")
        .eq("site_id", siteId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SocketGroup[];
    },
  });

  const working: DraftGroup[] = drafts ?? (groups as DraftGroup[]);
  const balance = useMemo(() => balancePhases(working), [working]);

  const saveMut = useMutation({
    mutationFn: async (next: DraftGroup[]) => {
      const existingIds = new Set((groups as SocketGroup[]).map((g) => g.id!).filter(Boolean));
      const nextIds = new Set(next.map((g) => g.id).filter(Boolean) as string[]);
      const toDelete = [...existingIds].filter((id) => !nextIds.has(id));
      if (toDelete.length > 0) {
        const { error } = await (supabase as any).from("site_socket_groups").delete().in("id", toDelete);
        if (error) throw error;
      }
      const rows = next.map((g, i) => ({
        id: g.id,
        site_id: siteId,
        quantity: Math.max(1, Math.floor(g.quantity || 0)),
        power_rating_kw: Number(g.power_rating_kw) || 0,
        phases: g.phases === 3 ? 3 : 1,
        sort_order: i,
      })).filter((r) => r.quantity > 0 && r.power_rating_kw > 0);
      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .from("site_socket_groups")
          .upsert(rows, { onConflict: "id" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Socket groups saved");
      setDrafts(null);
      qc.invalidateQueries({ queryKey: ["site-socket-groups", siteId] });
      qc.invalidateQueries({ queryKey: ["site", siteId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save socket groups"),
  });

  const addGroup = () => {
    setDrafts([...(working ?? []), { quantity: 1, power_rating_kw: 7, phases: 1, sort_order: (working?.length ?? 0), _new: true }]);
  };
  const updateGroup = (i: number, patch: Partial<DraftGroup>) => {
    setDrafts(working.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  };
  const removeGroup = (i: number) => {
    setDrafts(working.filter((_, idx) => idx !== i));
  };

  const dirty = drafts !== null;

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Sockets & Phase Balance
        </CardTitle>
        {canEdit && (
          <div className="flex gap-1">
            {dirty && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDrafts(null)} disabled={saveMut.isPending}>Cancel</Button>
                <Button size="sm" onClick={() => saveMut.mutate(working)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Saving…" : "Save"}
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={addGroup}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Group
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading socket groups…</p>
        ) : working.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No socket groups yet. Add one to describe the chargers on this site.
          </p>
        ) : (
          <div className="space-y-1.5">
            {working.map((g, i) => (
              <div key={g.id ?? `new-${i}`} className="grid grid-cols-[80px_100px_110px_28px] gap-2 items-center">
                <Input
                  type="number"
                  min={1}
                  value={g.quantity}
                  disabled={!canEdit}
                  onChange={(e) => updateGroup(i, { quantity: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={g.power_rating_kw}
                  disabled={!canEdit}
                  onChange={(e) => updateGroup(i, { power_rating_kw: Number(e.target.value) })}
                />
                <Select
                  value={String(g.phases)}
                  disabled={!canEdit}
                  onValueChange={(v) => updateGroup(i, { phases: (v === "3" ? 3 : 1) as 1 | 3 })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1-phase</SelectItem>
                    <SelectItem value="3">3-phase</SelectItem>
                  </SelectContent>
                </Select>
                {canEdit && (
                  <Button size="icon" variant="ghost" onClick={() => removeGroup(i)} className="h-8 w-8">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            <div className="grid grid-cols-[80px_100px_110px_28px] gap-2 text-[10px] uppercase text-muted-foreground">
              <span>Qty</span><span>kW / socket</span><span>Phases</span><span />
            </div>
          </div>
        )}

        <div className="rounded-md border p-3 bg-muted/30 space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs">Total sockets</span>
            <span className="font-medium">{balance.totalSockets}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs">Total connected load</span>
            <span className="font-semibold">{formatKw(balance.totalConnectedKw)}</span>
          </div>
          {balance.breakdownLabel && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground text-xs">Breakdown</span>
              <span className="text-right text-xs">{balance.breakdownLabel}</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {(["L1", "L2", "L3"] as const).map((p) => (
              <div key={p} className="rounded border p-2 text-center bg-background">
                <div className="text-[10px] uppercase text-muted-foreground">{p} Load</div>
                <div className="font-semibold text-sm">{formatKw(balance.totals[p])}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {balance.perPhaseSockets[p].length === 0
                    ? "—"
                    : balance.perPhaseSockets[p]
                        .map((s) => `${formatKw(s.phases === 3 ? s.power_rating_kw / 3 : s.power_rating_kw)}${s.phases === 3 ? "*" : ""}`)
                        .join(", ")}
                </div>
              </div>
            ))}
          </div>
          {balance.sockets.some((s) => s.phases === 3) && (
            <p className="text-[10px] text-muted-foreground">* = 3-phase socket, split evenly across L1/L2/L3.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}