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

const HIDDEN_KEYS = ["id", "geometry", "geom", "ogc_fid", "attrs_json", "layer_id", "created_at", "dno", "source_date"];

/** Flatten attrs_json into top-level properties so all CSV columns are accessible.
 *  MapLibre serialises nested objects to JSON strings, so we parse first. */
function flattenFeature(raw: Record<string, unknown>): Record<string, unknown> {
  const result = { ...raw };
  let attrs: Record<string, unknown> | null = null;

  if (raw.attrs_json) {
    if (typeof raw.attrs_json === "string") {
      try { attrs = JSON.parse(raw.attrs_json); } catch { /* ignore */ }
    } else if (typeof raw.attrs_json === "object" && !Array.isArray(raw.attrs_json)) {
      attrs = raw.attrs_json as Record<string, unknown>;
    }
  }

  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (!(k in result) || result[k] === null || result[k] === undefined) {
        result[k] = v;
      }
    }
  }
  delete result.attrs_json;
  return result;
}

const utilisationColor: Record<string, string> = {
  Low: "bg-emerald-500",
  "Below Average": "bg-lime-500",
  Average: "bg-amber-500",
  "Above Average": "bg-orange-500",
  High: "bg-red-500",
};

function SubstationInfo({ feature }: { feature: Record<string, unknown> }) {
  const utilPct = (feature.utilisation_pct ?? null) as number | null;
  const band = (feature.utilisation_band ?? null) as string | null;
  const headroomKw = (feature.transformer_headroom_kw ?? feature.headroom_kw ?? null) as number | null;
  const firmCapKw = (feature.firm_capacity_kw ?? feature.capacity_kw ?? null) as number | null;
  const maxDemandKw = (feature.max_demand_kw ?? feature.demand_kw ?? null) as number | null;
  const customers = (feature.connected_customers ?? null) as number | null;
  const siteName = (feature.site_name ?? feature.name ?? null) as string | null;
  const siteId = (feature.site_id ?? feature.asset_id ?? null) as string | null;
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
              {headroomKw?.toLocaleString() ?? "—"} kW
            </p>
            {headroomBand && <p className="text-[10px] text-muted-foreground">{headroomBand}</p>}
          </div>
        )}
        {firmCapKw !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Firm Capacity</p>
            <p className="text-sm font-semibold">{firmCapKw?.toLocaleString() ?? "—"} kW</p>
          </div>
        )}
        {maxDemandKw !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Max Demand</p>
            <p className="text-sm font-semibold">{maxDemandKw?.toLocaleString() ?? "—"} kW</p>
          </div>
        )}
        {customers !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Customers</p>
            <p className="text-sm font-semibold flex items-center gap-1">
              <Users className="h-3 w-3" />
              {customers?.toLocaleString() ?? "—"}
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

/** Dedicated info panel for Heat Map Data - Substation Areas */
function SubstationAreaInfo({ feature }: { feature: Record<string, unknown> }) {
  const name = (feature.name || feature.Name || "Substation Area") as string;
  const type = (feature.type || feature.Type || null) as string | null;
  const demandHeadroom = feature["demand headroom"] ?? feature.demand_headroom ?? null;
  const genHeadroom = feature["generation headroom"] ?? feature.generation_headroom ?? null;
  const faultLevelPct = feature["fault level %"] ?? feature["fault level%"] ?? feature.fault_level_pct ?? null;
  const genConstraints = feature["generation constraints"] ?? feature.generation_constraints ?? null;
  const demConstraints = feature["demand constraints"] ?? feature.demand_constraints ?? null;
  const ngConstraint = feature["national grid constraint"] ?? feature.national_grid_constraint ?? null;
  const firmCapacity = feature["firm capacity"] ?? feature.firm_capacity ?? null;
  const maxDemand = feature["maximum demand"] ?? feature.maximum_demand ?? null;
  const minDemand = feature["minimum demand"] ?? feature.minimum_demand ?? null;
  const downstreamVoltage = feature["downstream voltage"] ?? feature.downstream_voltage ?? null;
  const upstreamSub = feature["upstream substation"] ?? feature.upstream_substation ?? null;
  const upstreamGsp = feature["upstream gsp"] ?? feature.upstream_gsp ?? null;
  const localAuth = feature["local authority"] ?? feature.local_authority ?? null;

  const constraintColor = (val: string | null) => {
    if (!val) return "";
    const lower = val.toString().toLowerCase();
    if (lower.includes("red")) return "text-red-500 font-semibold";
    if (lower.includes("amber") || lower.includes("orange")) return "text-amber-500 font-semibold";
    if (lower.includes("green")) return "text-emerald-500 font-semibold";
    return "";
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm text-foreground">{name}</h3>
        <div className="flex items-center gap-2 mt-1">
          {type && <Badge variant="secondary" className="text-[10px]">{type}</Badge>}
          {localAuth && <Badge variant="outline" className="text-[10px]">{String(localAuth)}</Badge>}
        </div>
      </div>

      {/* Key metrics table matching NPG portal style */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            {type && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5 w-1/2">Substation Class</td><td className="px-2 py-1.5">{type}</td></tr>
            )}
            {demandHeadroom !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Demand Headroom (MW)</td><td className="px-2 py-1.5">{String(demandHeadroom)}</td></tr>
            )}
            {genHeadroom !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Generation Headroom (MW)</td><td className="px-2 py-1.5">{String(genHeadroom)}</td></tr>
            )}
            {faultLevelPct !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Fault Level %</td><td className="px-2 py-1.5">{String(faultLevelPct)}</td></tr>
            )}
            {firmCapacity !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Firm Capacity (MW)</td><td className="px-2 py-1.5">{String(firmCapacity)}</td></tr>
            )}
            {maxDemand !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Maximum Demand (MW)</td><td className="px-2 py-1.5">{String(maxDemand)}</td></tr>
            )}
            {minDemand !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Minimum Demand (MW)</td><td className="px-2 py-1.5">{String(minDemand)}</td></tr>
            )}
            {downstreamVoltage !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Downstream Voltage</td><td className="px-2 py-1.5">{String(downstreamVoltage)}</td></tr>
            )}
            {genConstraints !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Generation Constraints</td><td className={`px-2 py-1.5 ${constraintColor(String(genConstraints))}`}>{String(genConstraints)}</td></tr>
            )}
            {demConstraints !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Demand Constraints</td><td className={`px-2 py-1.5 ${constraintColor(String(demConstraints))}`}>{String(demConstraints)}</td></tr>
            )}
            {ngConstraint !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">National Grid Constraints</td><td className={`px-2 py-1.5 ${constraintColor(String(ngConstraint))}`}>{String(ngConstraint)}</td></tr>
            )}
            {upstreamSub !== null && (
              <tr className="border-b"><td className="bg-primary/10 font-semibold px-2 py-1.5">Upstream Substation</td><td className="px-2 py-1.5">{String(upstreamSub)}</td></tr>
            )}
            {upstreamGsp !== null && (
              <tr><td className="bg-primary/10 font-semibold px-2 py-1.5">Upstream GSP</td><td className="px-2 py-1.5">{String(upstreamGsp)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FeatureInfoPanel({ feature: rawFeature, layerLabel, onClose }: FeatureInfoPanelProps) {
  if (!rawFeature) return null;

  const feature = flattenFeature(rawFeature);
  const isSubstationArea = layerLabel.toLowerCase().includes("heat map") || layerLabel.toLowerCase().includes("substation area");
  const isSubstation = !isSubstationArea && (layerLabel.toLowerCase().includes("substation") || !!feature.utilisation_pct);

  return (
    <div className="absolute bottom-4 left-3 z-10 w-80">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-primary/5">
          <span className="text-sm font-semibold text-foreground truncate">{layerLabel}</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="max-h-[50vh] overflow-y-auto">
          <div className="px-3 py-2">
            {isSubstationArea ? <SubstationAreaInfo feature={feature} /> : isSubstation ? <SubstationInfo feature={feature} /> : <GenericInfo feature={feature} />}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

