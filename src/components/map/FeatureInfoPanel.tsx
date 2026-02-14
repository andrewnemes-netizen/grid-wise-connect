import { X, Zap, Activity, Users, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface FeatureInfoPanelProps {
  feature: Record<string, unknown> | null;
  layerLabel: string;
  onClose: () => void;
}

const HIDDEN_KEYS = ["id", "geometry", "geom", "ogc_fid", "attrs_json"];

const utilisationColor: Record<string, string> = {
  Low: "bg-emerald-500",
  "Below Average": "bg-lime-500",
  Average: "bg-amber-500",
  "Above Average": "bg-orange-500",
  High: "bg-red-500",
};

function SubstationInfo({ feature }: { feature: Record<string, unknown> }) {
  const utilPct = feature.utilisation_pct as number | null;
  const band = feature.utilisation_band as string | null;
  const headroomKw = feature.transformer_headroom_kw as number | null;
  const firmCapKw = feature.firm_capacity_kw as number | null;
  const maxDemandKw = feature.max_demand_kw as number | null;
  const customers = feature.connected_customers as number | null;
  const siteName = feature.site_name as string | null;
  const siteId = feature.site_id as string | null;
  const substationType = feature.substation_type as string | null;
  const headroomBand = feature.headroom_band as string | null;
  const threePhase = feature.three_phase as string | null;
  const upstream = feature.upstream_site as string | null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h3 className="font-semibold text-sm text-foreground">{siteName || siteId || "Substation"}</h3>
        <div className="flex items-center gap-2 mt-1">
          {substationType && <Badge variant="secondary" className="text-[10px]">{substationType}</Badge>}
          {threePhase === "Y" && <Badge variant="outline" className="text-[10px]">3-Phase</Badge>}
        </div>
      </div>

      {/* Utilisation gauge */}
      {utilPct !== null && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" /> Utilisation
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{utilPct}%</span>
              {band && (
                <Badge variant="outline" className="text-[10px]">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${utilisationColor[band] || "bg-muted"}`} />
                  {band}
                </Badge>
              )}
            </div>
          </div>
          <Progress value={Math.min(utilPct, 100)} className="h-2" />
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2">
        {headroomKw !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Headroom</p>
            <p className="text-sm font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3 text-primary" />
              {headroomKw.toLocaleString()} kW
            </p>
            {headroomBand && <p className="text-[10px] text-muted-foreground">{headroomBand}</p>}
          </div>
        )}
        {firmCapKw !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Firm Capacity</p>
            <p className="text-sm font-semibold">{firmCapKw.toLocaleString()} kW</p>
          </div>
        )}
        {maxDemandKw !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Max Demand</p>
            <p className="text-sm font-semibold">{maxDemandKw.toLocaleString()} kW</p>
          </div>
        )}
        {customers !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Customers</p>
            <p className="text-sm font-semibold flex items-center gap-1">
              <Users className="h-3 w-3" />
              {customers.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Upstream link */}
      {upstream && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowUpRight className="h-3 w-3" />
          <span>Upstream: <span className="font-medium text-foreground">{upstream}</span></span>
        </div>
      )}
    </div>
  );
}

function GenericInfo({ feature }: { feature: Record<string, unknown> }) {
  const entries = Object.entries(feature).filter(
    ([key]) => !HIDDEN_KEYS.includes(key.toLowerCase())
  );

  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No attributes available.</p>;

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between gap-2 text-xs py-0.5">
          <span className="text-muted-foreground capitalize shrink-0">{key.replace(/_/g, " ")}</span>
          <span className="text-foreground text-right truncate font-medium">{String(value ?? "—")}</span>
        </div>
      ))}
    </div>
  );
}

export function FeatureInfoPanel({ feature, layerLabel, onClose }: FeatureInfoPanelProps) {
  if (!feature) return null;

  const isSubstation = layerLabel.toLowerCase().includes("substation") || !!feature.utilisation_pct;

  return (
    <div className="absolute bottom-4 left-3 z-10 w-80">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-primary/5">
          <span className="text-sm font-semibold text-foreground truncate">{layerLabel}</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="max-h-72">
          <div className="px-3 py-2">
            {isSubstation ? <SubstationInfo feature={feature} /> : <GenericInfo feature={feature} />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
