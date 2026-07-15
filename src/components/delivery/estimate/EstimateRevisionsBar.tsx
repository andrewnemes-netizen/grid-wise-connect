import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitBranch, Award, Plus, History } from "lucide-react";
import { toast } from "sonner";

type Estimate = {
  id: string;
  name: string;
  status: string;
  revision: number;
  is_current: boolean;
  source_estimate_id: string | null;
  prelims_pct: number | null;
  prelims_amount: number | null;
  awarded_at: string | null;
  awarded_partner_id: string | null;
  updated_at: string;
};

export function EstimateRevisionsBar({
  estimate,
  onOpenEstimate,
}: {
  estimate: Estimate;
  onOpenEstimate: (id: string) => void;
}) {
  const qc = useQueryClient();
  const rootId = estimate.source_estimate_id ?? estimate.id;
  const [awardOpen, setAwardOpen] = useState(false);
  const [awardPartner, setAwardPartner] = useState<string | null>(estimate.awarded_partner_id);

  const siblings = useQuery({
    queryKey: ["estimate-lineage", rootId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .select("id,name,revision,status,is_current,updated_at,awarded_at")
        .or(`id.eq.${rootId},source_estimate_id.eq.${rootId}`)
        .order("revision", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const partners = useQuery({
    queryKey: ["partners-award-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners" as any).select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; name: string }[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["estimate-lineage", rootId] });
    qc.invalidateQueries({ queryKey: ["estimate", estimate.id] });
    qc.invalidateQueries({ queryKey: ["estimates-list"] });
  };

  const newRevision = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("clone_estimate_as_revision" as any, {
        _estimate_id: estimate.id,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (id) => {
      toast.success("New revision created");
      invalidate();
      if (id) onOpenEstimate(id);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create revision"),
  });

  const award = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("estimates" as any)
        .update({
          status: "AWARDED",
          awarded_partner_id: awardPartner,
        } as any)
        .eq("id", estimate.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estimate awarded — sibling revisions superseded");
      setAwardOpen(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to award"),
  });

  const statusTone = (s: string) =>
    s === "AWARDED" ? "bg-emerald-600/15 text-emerald-700 border-emerald-600/30"
    : s === "SUPERSEDED" ? "bg-muted text-muted-foreground border-border"
    : "bg-amber-500/15 text-amber-700 border-amber-500/30";

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-2 border-b bg-muted/30 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5" />
        <span className="font-medium">Revision</span>
      </div>
      <Select
        value={estimate.id}
        onValueChange={(v) => { if (v !== estimate.id) onOpenEstimate(v); }}
      >
        <SelectTrigger className="h-7 w-[220px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(siblings.data ?? []).map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              <span className="tabular-nums">Rev {s.revision}</span>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <span>{s.status}</span>
              {s.is_current && <span className="ml-1.5 text-primary">• current</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Badge variant="outline" className={statusTone(estimate.status)}>
        Rev {estimate.revision} · {estimate.status}
      </Badge>
      {estimate.is_current && (
        <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary">Current</Badge>
      )}
      {estimate.awarded_at && (
        <span className="text-muted-foreground">
          Awarded {new Date(estimate.awarded_at).toLocaleDateString()}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => newRevision.mutate()}
          disabled={newRevision.isPending || estimate.status === "AWARDED"}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />New revision
        </Button>

        <Dialog open={awardOpen} onOpenChange={setAwardOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={estimate.status === "AWARDED" || estimate.status === "SUPERSEDED"}
            >
              <Award className="h-3.5 w-3.5 mr-1" />Award
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Award Rev {estimate.revision}</DialogTitle>
              <DialogDescription>
                This locks the current revision as AWARDED and marks all sibling revisions as SUPERSEDED. This action is reversible only by an admin.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label className="text-xs">Awarded partner (optional)</Label>
              <Select value={awardPartner ?? "__none"} onValueChange={(v) => setAwardPartner(v === "__none" ? null : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a partner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— No partner —</SelectItem>
                  {(partners.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2">
                <History className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  {(siblings.data?.length ?? 0) - 1} sibling revision{((siblings.data?.length ?? 1) - 1) === 1 ? "" : "s"} will be marked SUPERSEDED.
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAwardOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => award.mutate()}
                disabled={award.isPending}
              >
                <Award className="h-3.5 w-3.5 mr-1" />Confirm award
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export function PrelimsInline({
  estimateId,
  prelims_pct,
  prelims_amount,
  currency,
  disabled,
}: {
  estimateId: string;
  prelims_pct: number | null;
  prelims_amount: number | null;
  currency: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (patch: { prelims_pct?: number | null; prelims_amount?: number | null }) => {
      const { error } = await supabase.from("estimates" as any).update(patch as any).eq("id", estimateId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["estimates-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-card text-xs">
      <span className="font-medium text-muted-foreground">Prelims</span>
      <Input
        type="number"
        step="0.1"
        placeholder="%"
        value={prelims_pct ?? ""}
        disabled={disabled}
        onChange={(e) => save.mutate({ prelims_pct: e.target.value === "" ? null : Number(e.target.value) })}
        className="h-6 w-16 text-xs"
      />
      <span className="text-muted-foreground">or</span>
      <Input
        type="number"
        step="1"
        placeholder={currency}
        value={prelims_amount ?? ""}
        disabled={disabled}
        onChange={(e) => save.mutate({ prelims_amount: e.target.value === "" ? null : Number(e.target.value) })}
        className="h-6 w-24 text-xs"
      />
    </div>
  );
}