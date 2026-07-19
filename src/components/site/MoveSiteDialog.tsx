import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  siteIds: string[];
  currentWpId: string;
  onMoved?: () => void;
};

export function MoveSiteDialog({ open, onOpenChange, siteIds, currentWpId, onMoved }: Props) {
  const qc = useQueryClient();
  const [toWpId, setToWpId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [adoptPartner, setAdoptPartner] = useState(false);
  const [result, setResult] = useState<any[] | null>(null);

  const bulk = siteIds.length > 1;

  useEffect(() => {
    if (!open) { setToWpId(""); setReason(""); setAdoptPartner(false); setResult(null); }
  }, [open]);

  const wps = useQuery({
    queryKey: ["wp-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_packages")
        .select("id, code, name, programme_id, programmes(name)")
        .neq("id", currentWpId)
        .order("code", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const blockers = useQuery({
    queryKey: ["site-blockers", siteIds],
    queryFn: async () => {
      const out: Record<string, { blocker: string; detail: string }[]> = {};
      for (const sid of siteIds) {
        const { data, error } = await supabase.rpc("site_move_blockers", { _site_id: sid });
        if (error) throw error;
        out[sid] = (data ?? []) as any;
      }
      return out;
    },
    enabled: open && siteIds.length > 0,
  });

  const hasBlockers = useMemo(
    () => Object.values(blockers.data ?? {}).some((v) => (v?.length ?? 0) > 0),
    [blockers.data],
  );

  const move = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("move_sites_between_wps", {
        _site_ids: siteIds,
        _to_wp_id: toWpId,
        _reason: reason.trim(),
        _adopt_destination_partner: adoptPartner,
      });
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (data: any[]) => {
      setResult(data);
      const moved = data.filter((r) => r.status === "moved").length;
      const blocked = data.filter((r) => r.status === "blocked").length;
      const errored = data.filter((r) => r.status === "error").length;
      if (moved) toast.success(`${moved} site${moved > 1 ? "s" : ""} moved`);
      if (blocked) toast.warning(`${blocked} blocked by locked records`);
      if (errored) toast.error(`${errored} failed`);
      qc.invalidateQueries();
      if (onMoved) onMoved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Move failed"),
  });

  const canSubmit = !!toWpId && reason.trim().length > 3 && !move.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Move {bulk ? `${siteIds.length} sites` : "site"} to another Work Package
          </DialogTitle>
          <DialogDescription>
            Every operational record belonging to {bulk ? "each site" : "this site"} — tasks, estimates,
            surveys, designs, PoC offers, permits, RAMS, TM, photos, documents, readiness and delivery
            matrix — moves with it. Sites with locked commercial records (approved invoice, completed
            commissioning, signed handover, closed contract) will be blocked.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            {result.map((r, i) => (
              <div key={i} className="flex items-center justify-between border rounded px-2 py-1">
                <span className="font-mono text-xs">{String(r.site_id).slice(0, 8)}</span>
                <Badge variant={r.status === "moved" ? "default" : r.status === "blocked" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
                <span className="text-xs text-muted-foreground max-w-[220px] truncate" title={r.message}>
                  {r.message}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Destination Work Package</Label>
              <select
                className="w-full mt-1 rounded border bg-background h-9 px-2 text-sm"
                value={toWpId}
                onChange={(e) => setToWpId(e.target.value)}
              >
                <option value="">Select a Work Package…</option>
                {(wps.data ?? []).map((wp: any) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.code} · {wp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Reason (required)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this site being moved?"
                rows={3}
              />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="adopt-partner"
                checked={adoptPartner}
                onCheckedChange={(c) => setAdoptPartner(!!c)}
              />
              <div>
                <Label htmlFor="adopt-partner" className="text-sm">
                  Adopt destination Work Package&apos;s delivery partner
                </Label>
                <p className="text-xs text-muted-foreground">
                  By default the site keeps its existing partner. Tick this if it should switch.
                </p>
              </div>
            </div>

            {hasBlockers && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Some sites are blocked</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 space-y-1 text-xs">
                    {Object.entries(blockers.data ?? {}).flatMap(([sid, list]) =>
                      (list as any[]).map((b, i) => (
                        <li key={`${sid}-${i}`}>
                          <span className="font-mono">{sid.slice(0, 8)}</span> — {b.blocker}: {b.detail}
                        </li>
                      )),
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => move.mutate()} disabled={!canSubmit}>
                {move.isPending ? "Moving…" : `Move ${siteIds.length} site${bulk ? "s" : ""}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}