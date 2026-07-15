import WpEstimatePanel from "@/components/delivery/WpEstimatePanel";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export default function WpEstimatingTab() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estimating</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Client, partner and DNO cost lenses over shared estimate lines. Roll up per-site estimates
            with WP-level adjustments (contingency, prelims, overheads, discounts).
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 4</Badge>
      </div>
      <WpEstimatePanel wpId={id} />
    </div>
  );
}