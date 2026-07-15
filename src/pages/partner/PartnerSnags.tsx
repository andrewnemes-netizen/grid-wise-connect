import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerWorkPackages } from "./usePartnerData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface SnagRow {
  id: string;
  work_package_id: string;
  site_id: string | null;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  raised_at: string;
  target_close_date: string | null;
  partner_acknowledged_at: string | null;
  partner_ack_notes: string | null;
}

export default function PartnerSnags() {
  const { workPackages, workPackageIds, loading: wpLoading } = usePartnerWorkPackages();
  const [rows, setRows] = useState<SnagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SnagRow | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"outstanding" | "all">("outstanding");

  const load = useCallback(async () => {
    if (workPackageIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("snagging_items")
      .select(
        "id, work_package_id, site_id, title, description, severity, status, raised_at, target_close_date, partner_acknowledged_at, partner_ack_notes",
      )
      .in("work_package_id", workPackageIds)
      .order("raised_at", { ascending: false });
    setRows((data ?? []) as SnagRow[]);
    setLoading(false);
  }, [workPackageIds.join(",")]);

  useEffect(() => {
    if (!wpLoading) void load();
  }, [wpLoading, load]);

  const byWp = useMemo(() => {
    const map = new Map<string, string>();
    workPackages.forEach((w) => map.set(w.id, w.code ?? w.name ?? w.id));
    return map;
  }, [workPackages]);

  const visible = useMemo(
    () =>
      filter === "outstanding"
        ? rows.filter((r) => ["open", "in_progress"].includes(r.status))
        : rows,
    [rows, filter],
  );

  const acknowledge = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase.rpc("partner_acknowledge_snag", {
      _snag_id: selected.id,
      _notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Acknowledgement recorded");
    setSelected(null);
    setNotes("");
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Outstanding items</h1>
          <p className="text-sm text-muted-foreground">
            Review and acknowledge snags flagged against your work packages.
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant={filter === "outstanding" ? "default" : "outline"} size="sm" onClick={() => setFilter("outstanding")}>
            Outstanding
          </Button>
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
            All
          </Button>
        </div>
      </div>

      {loading || wpLoading ? (
        <Skeleton className="h-40" />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === "outstanding" ? "No outstanding items — nice." : "No items recorded yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <SeverityIcon severity={s.severity} />
                    {s.title}
                  </CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    <SeverityBadge severity={s.severity} />
                    <Badge variant="outline">{s.status.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="text-xs text-muted-foreground">
                  {byWp.get(s.work_package_id) ?? s.work_package_id} · Raised{" "}
                  {new Date(s.raised_at).toLocaleDateString()}
                  {s.target_close_date && ` · Target close ${new Date(s.target_close_date).toLocaleDateString()}`}
                </div>
                {s.description && <p className="text-sm">{s.description}</p>}

                {s.partner_acknowledged_at ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 rounded p-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Acknowledged {new Date(s.partner_acknowledged_at).toLocaleString()}
                    {s.partner_ack_notes && (
                      <span className="text-muted-foreground">— {s.partner_ack_notes}</span>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelected(s);
                      setNotes("");
                    }}
                  >
                    Acknowledge
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge item</DialogTitle>
            <DialogDescription>
              Confirm you've seen this item. Add a short note if you have an action or timeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {selected && (
              <div className="text-sm font-medium border rounded p-2 bg-muted/40">{selected.title}</div>
            )}
            <Textarea
              placeholder="Optional note (e.g. Will attend site Friday)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={acknowledge} disabled={saving}>
              {saving ? "Saving…" : "Acknowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <AlertTriangle className="h-4 w-4 text-destructive" />;
  if (severity === "major") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant =
    severity === "critical" ? "destructive" : severity === "major" ? "secondary" : "outline";
  return <Badge variant={variant as any}>{severity}</Badge>;
}