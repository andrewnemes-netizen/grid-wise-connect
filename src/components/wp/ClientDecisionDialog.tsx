import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";

export function ClientDecisionDialog({
  open, onOpenChange, siteId, siteName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  siteName?: string;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");

  const { data: estimate, isLoading } = useQuery({
    queryKey: ["site-latest-estimate", siteId],
    enabled: open && !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_estimates")
        .select("id, name, version_number, status, total_price, currency, client_decision, decided_at, decision_notes")
        .eq("site_id", siteId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const decide = useMutation({
    mutationFn: async (decision: "accepted" | "rejected") => {
      if (!estimate?.id) throw new Error("No estimate found for this site");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      const { error } = await (supabase as any)
        .from("site_estimates")
        .update({
          client_decision: decision,
          decided_at: new Date().toISOString(),
          decided_by: uid,
          decision_notes: notes || null,
        })
        .eq("id", estimate.id);
      if (error) throw error;
    },
    onSuccess: (_d, decision) => {
      toast.success(decision === "accepted" ? "Client acceptance recorded — commercial gate passed" : "Client rejection recorded — site blocked");
      qc.invalidateQueries({ queryKey: ["wp-site-precon-status"] });
      qc.invalidateQueries({ queryKey: ["wp-site-register"] });
      qc.invalidateQueries({ queryKey: ["site-latest-estimate", siteId] });
      onOpenChange(false);
      setNotes("");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to record decision"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Client decision{siteName ? ` — ${siteName}` : ""}</DialogTitle>
          <DialogDescription>
            Record the client's response to the latest quotation. Accepting passes the commercial gate; rejecting blocks the site.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading estimate…</p>
        ) : !estimate ? (
          <p className="text-sm text-muted-foreground">No estimate exists for this site yet. Create one first.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{estimate.name} <span className="text-muted-foreground text-xs">v{estimate.version_number}</span></span>
                <Badge variant="outline" className="text-[10px]">{estimate.status}</Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                {estimate.currency} {Number(estimate.total_price ?? 0).toLocaleString()}
              </div>
              {estimate.client_decision && (
                <div className="text-xs pt-1">
                  Previous decision:{" "}
                  <Badge variant={estimate.client_decision === "accepted" ? "default" : "destructive"} className="text-[10px]">
                    {estimate.client_decision}
                  </Badge>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="decision-notes" className="text-xs">Notes {`(optional — required context for rejections becomes the blocker reason)`}</Label>
              <Textarea
                id="decision-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Client accepted subject to revised programme / rejected due to price"
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!estimate || decide.isPending}
            onClick={() => decide.mutate("rejected")}
          >
            <XCircle className="h-4 w-4 mr-1" /> Reject
          </Button>
          <Button
            disabled={!estimate || decide.isPending}
            onClick={() => decide.mutate("accepted")}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}