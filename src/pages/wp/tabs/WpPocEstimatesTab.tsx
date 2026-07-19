import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PocEstimatesTab } from "@/components/delivery/poc-estimate/PocEstimatesTab";

export default function WpPocEstimatesTab() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PoC Estimates</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Point-of-Connection application costs raised against DNO offers. This is a distinct
            estimate type from the <strong>EV Build Estimate</strong> used for install pricing —
            the two are tracked separately and never combined into a single total.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 bg-primary/5 border-primary/30 text-primary">
          PoC
        </Badge>
      </div>
      <Card className="p-3 text-xs text-muted-foreground">
        A PoC Estimate is created automatically when a DNO offer is logged for a site.
        You can also add ad-hoc PoC estimates below.
      </Card>
      <PocEstimatesTab workPackageId={id} />
    </div>
  );
}