import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { EstimatesTab } from "@/components/delivery/estimate/EstimatesTab";

export default function WpPocEstimatesTab() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PoC Estimates</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Point-of-Connection application costs raised against DNO offers. Uses the standard
            group-based Estimates engine — distinct from the <strong>EV Build Estimate</strong>
            used for install pricing; the two are tracked separately and never combined into a
            single total.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 bg-primary/5 border-primary/30 text-primary">
          PoC
        </Badge>
      </div>
      <EstimatesTab scope={{ work_package_id: id }} />
    </div>
  );
}