import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { EstimatesTab } from "@/components/delivery/estimate/EstimatesTab";

export default function WpEstimatingTab() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">EV Build Estimates</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            EV Build install pricing — feeder pillar forward to chargers. Uses the standard
            group-based Estimates engine — distinct from the <strong>PoC Estimate</strong> used
            for connection costs; the two are tracked separately and never combined into a
            single total.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Work Package</Badge>
      </div>
      <EstimatesTab scope={{ work_package_id: id }} kind="build" />
    </div>
  );
}