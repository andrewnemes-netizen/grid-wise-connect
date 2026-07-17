import WpEstimatePanel from "@/components/delivery/WpEstimatePanel";
import SiteEstimatesPanel from "@/components/delivery/SiteEstimatesPanel";
import { useParams, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { EstimateBreadcrumb } from "@/components/delivery/estimate/EstimateBreadcrumb";
import { Card } from "@/components/ui/card";
import { MapPin } from "lucide-react";

export default function WpEstimatingTab() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  if (!id) return null;

  const siteId = params.get("siteId") || undefined;
  const rawMode = params.get("mode");
  const mode = (rawMode === "detailed" || rawMode === "synthetic" || rawMode === "history")
    ? rawMode
    : undefined;
  const source = params.get("source");

  // Site-scoped view launched from Portfolio (or wherever)
  if (siteId && mode) {
    return (
      <div className="space-y-4">
        <EstimateBreadcrumb wpId={id} siteId={siteId} mode={mode} />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {mode === "detailed" && "Detailed Site Estimate"}
              {mode === "synthetic" && "Synthetic (Rate-Card) Site Estimate"}
              {mode === "history" && "Site Estimate History"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {mode === "detailed" && "BOQ-driven site estimate. Import engineering quantities from the latest Gridwise study or design; commercial figures are owned here."}
              {mode === "synthetic" && "Rate-card + recipe driven site estimate using the WP contract's active rate-card version."}
              {mode === "history" && "All estimate revisions for this site. Only APPROVED versions can be rolled into the Work Package estimate."}
            </p>
          </div>
          {source === "portfolio" && <Badge variant="outline" className="shrink-0">From Portfolio</Badge>}
        </div>
        <SiteEstimatesPanel wpId={id} focusSiteId={siteId} autoMode={mode} />
        <Card className="p-3 text-xs text-muted-foreground">
          Approved site estimates can then be included in the Work Package estimate via{" "}
          <a className="underline underline-offset-2" href={`/wp/${id}/commercial/estimating`}>WP Estimate</a>.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <EstimateBreadcrumb wpId={id} />
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