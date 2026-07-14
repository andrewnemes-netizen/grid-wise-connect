import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowLeft } from "lucide-react";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  accepted: "bg-emerald-500/10 text-emerald-700",
  rejected: "bg-destructive/10 text-destructive",
  expired: "bg-amber-500/10 text-amber-700",
};

export default function DeliveryProposals() {
  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ["delivery-proposals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id,title,status,total_amount,currency,created_at,study_id,accounts(name),studies(study_name,site_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <Link to="/delivery" className="text-sm text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Delivery
        </Link>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="h-6 w-6" /> Proposals
        </h1>
        <p className="text-sm text-muted-foreground">
          Accept a proposal into a Work Package. The Gridwise estimate and BOQ are snapshotted at award.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading proposals…</p>
      ) : proposals.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">No proposals yet</h3>
          <p className="text-sm text-muted-foreground">Create a proposal from a Gridwise study.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {proposals.map((p: any) => (
            <Link key={p.id} to={`/delivery/proposal/${p.id}`}>
              <Card className="p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium truncate">{p.title ?? p.studies?.study_name ?? "Untitled proposal"}</h3>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-1">
                      <Badge variant="secondary" className={statusColor[p.status] ?? ""}>{p.status}</Badge>
                      {p.accounts?.name && <span>{p.accounts.name}</span>}
                      {p.studies?.study_name && <span>· {p.studies.study_name}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium">
                      {p.total_amount ? `${p.currency ?? "GBP"} ${Number(p.total_amount).toLocaleString()}` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}