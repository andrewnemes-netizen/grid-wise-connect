import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, FileText, ArrowRight, Zap } from "lucide-react";
import { toast } from "sonner";
import { PocEstimateEditor } from "./PocEstimateEditor";

const fmt = (n: number, c = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n || 0);

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  accepted: "bg-emerald-600/15 text-emerald-700 border-emerald-600/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

export function PocEstimatesTab({ workPackageId, siteId }: { workPackageId: string; siteId?: string }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const key = useMemo(() => ["poc-estimates-list", workPackageId, siteId ?? null], [workPackageId, siteId]);

  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase
        .from("poc_estimates" as any)
        .select("*, sites:site_id(name, address)")
        .eq("work_package_id", workPackageId)
        .order("created_at", { ascending: false });
      if (siteId) q = q.eq("site_id", siteId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const n = (list.data?.length ?? 0) + 1;
      const { data, error } = await supabase
        .from("poc_estimates" as any)
        .insert({
          work_package_id: workPackageId,
          site_id: siteId ?? null,
          name: `PoC Estimate ${String(n).padStart(2, "0")}`,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: (id) => {
      toast.success("PoC estimate created");
      qc.invalidateQueries({ queryKey: key });
      setOpenId(id);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> PoC Estimates
          </h3>
          <p className="text-xs text-muted-foreground max-w-xl">
            DNO Point-of-Connection application costs. Kept separate from EV Build estimates — they are
            never merged into one total.
          </p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-1" /> New PoC estimate
        </Button>
      </div>

      {list.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : (list.data?.length ?? 0) === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <div className="text-sm text-muted-foreground mb-1">No PoC estimates yet.</div>
          <div className="text-xs text-muted-foreground mb-4">
            One is created automatically when a DNO PoC offer is logged for a site.
          </div>
          <Button onClick={() => create.mutate()}>
            <Plus className="h-4 w-4 mr-1" /> Create PoC estimate
          </Button>
        </Card>
      ) : (
        <div className="grid gap-2">
          {list.data?.map((e) => (
            <Card
              key={e.id}
              className="p-4 hover:shadow-panel transition-shadow cursor-pointer"
              onClick={() => setOpenId(e.id)}
            >
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/30 text-primary">
                      PoC
                    </Badge>
                    <span className="font-heading font-semibold truncate">{e.name}</span>
                    <Badge variant="outline" className={"text-[10px] uppercase " + (STATUS_STYLE[e.status] ?? "")}>
                      {e.status}
                    </Badge>
                    {e.sites?.name && (
                      <span className="text-xs text-muted-foreground truncate">· {e.sites.name}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(e.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <Stat label="Cost" value={fmt(Number(e.total_cost), e.currency)} />
                <Stat label="Price" value={fmt(Number(e.total_price), e.currency)} accent big />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] p-0 overflow-hidden flex flex-col">
          {openId && (
            <PocEstimateEditor
              estimateId={openId}
              onClose={() => {
                setOpenId(null);
                qc.invalidateQueries({ queryKey: key });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent, big }: { label: string; value: string; accent?: boolean; big?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-heading tabular-nums ${big ? "text-lg" : "text-sm"} ${accent ? "text-primary" : ""}`}>
        {value}
      </div>
    </div>
  );
}