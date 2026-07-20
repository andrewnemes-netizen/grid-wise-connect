import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, FileText, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { EstimateEditor } from "./EstimateEditor";

const fmt = (n: number, c = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n || 0);

export function EstimatesTab({ scope }: { scope: { work_package_id?: string; project_id?: string } }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["estimates-list", scope],
    queryFn: async () => {
      let q = supabase.from("estimates" as any).select("*").order("created_at", { ascending: false });
      if (scope.work_package_id) q = q.eq("work_package_id", scope.work_package_id);
      if (scope.project_id) q = q.eq("project_id", scope.project_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const n = (list.data?.length ?? 0) + 1;
      const { data, error } = await supabase.from("estimates" as any).insert({
        ...scope, name: `Estimate ${String(n).padStart(2, "0")}`,
      } as any).select("id").single();
      if (error) throw error;
      // seed default groups
      await supabase.from("estimate_groups" as any).insert([
        { estimate_id: (data as any).id, name: "Civils", sort_index: 0, color: "#0d7a5f" },
        { estimate_id: (data as any).id, name: "Electrical", sort_index: 1, color: "#c9a84c" },
      ] as any);
      return (data as any).id as string;
    },
    onSuccess: (id) => { toast.success("Estimate created"); qc.invalidateQueries({ queryKey: ["estimates-list", scope] }); setOpenId(id); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg">Estimates</h3>
          <p className="text-xs text-muted-foreground">BOQ-driven pricing with live totals, recipes, markup and VAT.</p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-1" /> New estimate
        </Button>
      </div>

      {list.data?.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <div className="text-sm text-muted-foreground mb-4">No estimates yet.</div>
          <Button onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1" /> Create first estimate</Button>
        </Card>
      ) : (
        <div className="grid gap-2">
          {list.data?.map((e) => (
            <Card key={e.id} className="p-4 hover:shadow-panel transition-shadow cursor-pointer" onClick={() => setOpenId(e.id)}>
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-heading font-semibold truncate">{e.name}</span>
                    <Badge variant="outline" className="text-[10px]">Rev {e.revision ?? 1}</Badge>
                    <Badge
                      variant="outline"
                      className={
                        "text-[10px] " +
                        (e.status === "AWARDED"
                          ? "bg-emerald-600/15 text-emerald-700 border-emerald-600/30"
                          : e.status === "SUPERSEDED"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-500/15 text-amber-700 border-amber-500/30")
                      }
                    >
                      {e.status}
                    </Badge>
                    {e.is_current && (
                      <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">Current</Badge>
                    )}
                    {e.ref && <span className="text-xs text-muted-foreground">{e.ref}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">Updated {new Date(e.updated_at).toLocaleDateString()}</div>
                </div>
                <Stat label="Cost" value={fmt(e.total_cost, e.currency)} />
                <Stat label="Price" value={fmt(e.total_price, e.currency)} accent />
                <Stat label="Grand Total" value={fmt(e.grand_total, e.currency)} big />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <EditorDialog openId={openId} setOpenId={setOpenId} />
    </div>
  );
}

function Stat({ label, value, accent, big }: { label: string; value: string; accent?: boolean; big?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-heading tabular-nums ${big ? "text-lg" : "text-sm"} ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}