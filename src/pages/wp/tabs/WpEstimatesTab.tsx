import { useParams } from "react-router-dom";
import { EstimatesTab } from "@/components/delivery/estimate/EstimatesTab";
import { Badge } from "@/components/ui/badge";

export default function WpEstimatesTab() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estimates</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Group-based estimate editor with revisions, award workflow and quotation export.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Work Package</Badge>
      </div>
      <EstimatesTab scope={{ work_package_id: id }} />
    </div>
  );
}