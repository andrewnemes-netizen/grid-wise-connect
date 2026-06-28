import { X, Zap, Activity, Users, ArrowUpRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FeatureInfoPanelProps {
  feature: Record<string, unknown> | null;
  layerLabel: string;
  onClose: () => void;
}

const HIDDEN_KEYS = ["id", "geometry", "geom", "ogc_fid", "attrs_json", "layer_id", "created_at", "dno", "source_date"];
const PLANNING_HIDDEN_KEYS = ["typology", "prefix", "organisation-entity", "quality"];

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
  const utilPct = (feature.utilisation_pct ?? feature.fault_level_ ?? null) as number | null;
  const band = (feature.utilisation_band ?? null) as string | null;

  // Detect whether values come from attrs_json MW fields (firm_cap, demhr, maxdemand)
  // or from direct kW columns (transformer_headroom_kw, firm_capacity_kw, max_demand_kw)
  const hasMwFields = feature.firm_cap != null || feature.demhr != null || feature.maxdemand != null;
  const unit = hasMwFields ? "MW" : "kW";

  const headroomRaw = (feature.transformer_headroom_kw ?? feature.headroom_kw ?? feature.demhr ?? null) as number | null;
  const firmCapRaw = (feature.firm_capacity_kw ?? feature.capacity_kw ?? feature.firm_cap ?? null) as number | null;
  const maxDemandRaw = (feature.max_demand_kw ?? feature.demand_kw ?? feature.maxdemand ?? null) as number | null;
  const customers = (feature.connected_customers ?? null) as number | null;
  const siteName = (feature.site_name ?? feature.name ?? feature.psp_name ?? null) as string | null;
  const siteId = (feature.site_id ?? feature.asset_id ?? null) as string | null;
  const substationType = (feature.substation_type ?? feature.typetable ?? null) as string | null;
  const headroomBand = feature.headroom_band as string | null;
  const threePhase = feature.three_phase as string | null;
  const upstream = (feature.upstream_site ?? feature.upstreamname ?? null) as string | null;
  const genHeadroom = (feature.genhr ?? null) as number | null;
  const genConstraint = (feature.genconstraint ?? feature.worst_case_constraint_gen_colour ?? null) as string | null;
  const demConstraint = (feature.demconstraint ?? feature.worst_case_constraint_dem_colour ?? null) as string | null;
  const voltageKv = (feature.voltage_kv ?? feature.pvoltage ?? null) as number | null;
  const gspName = (feature.gsp_name ?? null) as string | null;
  const faultLevelPct = (feature.fault_level_ ?? null) as number | null;

  // LTDS capacity/headroom lookup for UKPN substations
  const sfl = (feature.sitefunctionallocation ?? feature.functionallocation ?? null) as string | null;
  const [ltds, setLtds] = useState<any | null>(null);
  useEffect(() => {
    let alive = true;
    setLtds(null);
    if (!sfl) return;
    (async () => {
      const { data, error } = await supabase.rpc("ukpn_substation_capacity_lookup", { _sfl: sfl });
      if (!alive || error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row && (row.firm_capacity_mva != null || row.peak_true_mw != null || row.peak_observed_mw != null || row.fault_3ph_ka != null)) {
        setLtds(row);
      }
    })();
    return () => { alive = false; };
  }, [sfl]);

  // NPG monthly circuit utilisation lookup for connected circuits
  const lookupName = (siteName ?? upstream ?? gspName ?? null) as string | null;
  const [circuits, setCircuits] = useState<any[] | null>(null);
  useEffect(() => {
    let alive = true;
    setCircuits(null);
    if (!lookupName || lookupName.length < 3) return;
    (async () => {
      const { data, error } = await supabase.rpc("ukpn_circuits_for_substation", { p_name: lookupName });
      if (!alive || error) return;
      if (Array.isArray(data) && data.length > 0) setCircuits(data);
    })();
    return () => { alive = false; };
  }, [lookupName]);

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
        {headroomRaw !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Headroom</p>
            <p className="text-sm font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3 text-primary" />
              {headroomRaw?.toLocaleString() ?? "—"} {unit}
            </p>
            {headroomBand && <p className="text-[10px] text-muted-foreground">{headroomBand}</p>}
          </div>
        )}
        {firmCapRaw !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Firm Capacity</p>
            <p className="text-sm font-semibold">{firmCapRaw?.toLocaleString() ?? "—"} {unit}</p>
          </div>
        )}
        {maxDemandRaw !== null && (
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] text-muted-foreground">Max Demand</p>
            <p className="text-sm font-semibold">{maxDemandRaw?.toLocaleString() ?? "—"} {unit}</p>
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

      {/* Upstream & GSP */}
      {upstream && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowUpRight className="h-3 w-3" />
          <span>Upstream: <span className="font-medium text-foreground">{upstream}</span></span>
        </div>
      )}
      {gspName && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowUpRight className="h-3 w-3" />
          <span>GSP: <span className="font-medium text-foreground">{gspName}</span></span>
        </div>
      )}

      {/* Generation headroom */}
      {genHeadroom !== null && (
        <div className="rounded-md border bg-muted/20 p-2">
          <p className="text-[10px] text-muted-foreground">Generation Headroom</p>
          <p className="text-sm font-semibold">{genHeadroom} MW</p>
        </div>
      )}

      {/* Voltage */}
      {voltageKv !== null && (
        <div className="text-xs text-muted-foreground">Voltage: <span className="font-medium text-foreground">{voltageKv} kV</span></div>
      )}

      {/* Fault Level */}
      {faultLevelPct !== null && (
        <div className="text-xs text-muted-foreground">Fault Level: <span className="font-medium text-foreground">{typeof faultLevelPct === 'number' ? faultLevelPct.toFixed(1) : faultLevelPct}%</span></div>
      )}

      {/* Constraints */}
      {(genConstraint || demConstraint) && (
        <div className="grid grid-cols-2 gap-2">
          {genConstraint && (
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="text-[10px] text-muted-foreground">Gen Constraint</p>
              <p className={`text-xs font-semibold ${genConstraint.toLowerCase().includes('red') ? 'text-red-500' : genConstraint.toLowerCase().includes('amber') ? 'text-amber-500' : 'text-emerald-500'}`}>{genConstraint}</p>
            </div>
          )}
          {demConstraint && (
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="text-[10px] text-muted-foreground">Dem Constraint</p>
              <p className={`text-xs font-semibold ${demConstraint.toLowerCase().includes('red') ? 'text-red-500' : demConstraint.toLowerCase().includes('amber') ? 'text-amber-500' : 'text-emerald-500'}`}>{demConstraint}</p>
            </div>
          )}
        </div>
      )}

      {/* LTDS Capacity & Headroom (UKPN) */}
      {ltds && (
        <div className="rounded-md border bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3 text-primary" /> LTDS Capacity & Headroom
            </p>
            {ltds.year && <Badge variant="outline" className="text-[10px]">{ltds.year}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ltds.firm_capacity_mva != null && (
              <div className="rounded-md border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">Firm Capacity</p>
                <p className="text-sm font-semibold">{Number(ltds.firm_capacity_mva).toLocaleString()} MVA</p>
              </div>
            )}
            {(ltds.peak_true_mw ?? ltds.peak_observed_mw) != null && (
              <div className="rounded-md border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">Peak Demand</p>
                <p className="text-sm font-semibold">{Number(ltds.peak_true_mw ?? ltds.peak_observed_mw).toLocaleString()} MW</p>
              </div>
            )}
            {(ltds.headroom_true_mva ?? ltds.headroom_observed_mva) != null && (
              <div className="rounded-md border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">Headroom</p>
                <p className={`text-sm font-semibold ${Number(ltds.headroom_true_mva ?? ltds.headroom_observed_mva) <= 0 ? "text-red-500" : "text-emerald-600"}`}>
                  {Number(ltds.headroom_true_mva ?? ltds.headroom_observed_mva).toLocaleString()} MVA
                </p>
              </div>
            )}
            {ltds.fault_3ph_ka != null && (
              <div className="rounded-md border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">Fault Level (3ph)</p>
                <p className="text-sm font-semibold">{Number(ltds.fault_3ph_ka).toLocaleString()} kA</p>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Source: UKPN LTDS Tables 2a–4b</p>
        </div>
      )}

      {/* NPG Monthly Circuit Loading */}
      {circuits && circuits.length > 0 && (
        <div className="rounded-md border bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1">
              <Activity className="h-3 w-3 text-primary" /> Connected Circuits — Monthly Peak
            </p>
            <Badge variant="outline" className="text-[10px]">{circuits.length}</Badge>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {circuits.slice(0, 8).map((c, i) => (
              <div key={i} className="rounded-md border bg-background p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{c.circuit_id} <span className="text-muted-foreground font-normal">· {c.voltage_kv} kV</span></span>
                  <span className="font-mono text-[11px]">{c.peak_mw != null ? `${Number(c.peak_mw).toFixed(1)} MW` : "—"}</span>
                </div>
                {c.feeder_description && (
                  <div className="text-[10px] text-muted-foreground truncate">{c.feeder_description}</div>
                )}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{c.from_node} → {c.to_node}</span>
                  <span>12-mo peak: {c.months_12_peak_mw != null ? `${Number(c.months_12_peak_mw).toFixed(1)} MW` : "—"}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Source: NPG monthly circuit operational data (132/33 kV)</p>
        </div>
      )}
    </div>
  );
}

/** Dedicated info panel for Planning Data (from planning.data.gov.uk vector tiles) */
function PlanningInfo({ feature, layerLabel }: { feature: Record<string, unknown>; layerLabel: string }) {
  const name = (feature.name || "—") as string;
  const entity = feature.entity as number | string | null;
  const dataset = (feature.dataset || feature.prefix || "") as string;
  const reference = (feature.reference || "") as string;
  const entryDate = (feature["entry-date"] || "") as string;
  const startDate = (feature["start-date"] || "") as string;
  const endDate = (feature["end-date"] || "") as string;
  const localAuthority = (feature["local-authority-district"] || "") as string;

  const entityUrl = entity ? `https://www.planning.data.gov.uk/entity/${entity}` : null;

  // Show all properties except hidden ones
  const extraEntries = Object.entries(feature).filter(
    ([key]) =>
      !PLANNING_HIDDEN_KEYS.includes(key) &&
      !["name", "entity", "dataset", "reference", "entry-date", "start-date", "end-date", "local-authority-district"].includes(key)
  );

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-sm text-foreground">{name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{layerLabel}</Badge>
          {localAuthority && <Badge variant="outline" className="text-[10px]">{localAuthority}</Badge>}
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-b">
              <td className="bg-primary/10 font-semibold px-2 py-1.5 w-2/5">Dataset</td>
              <td className="px-2 py-1.5 capitalize">{dataset.replace(/-/g, " ")}</td>
            </tr>
            {reference && (
              <tr className="border-b">
                <td className="bg-primary/10 font-semibold px-2 py-1.5">Reference</td>
                <td className="px-2 py-1.5">{reference}</td>
              </tr>
            )}
            {entryDate && (
              <tr className="border-b">
                <td className="bg-primary/10 font-semibold px-2 py-1.5">Entry Date</td>
                <td className="px-2 py-1.5">{entryDate}</td>
              </tr>
            )}
            {startDate && (
              <tr className="border-b">
                <td className="bg-primary/10 font-semibold px-2 py-1.5">Start Date</td>
                <td className="px-2 py-1.5">{startDate}</td>
              </tr>
            )}
            {endDate && (
              <tr className="border-b">
                <td className="bg-primary/10 font-semibold px-2 py-1.5">End Date</td>
                <td className="px-2 py-1.5">{endDate}</td>
              </tr>
            )}
            {extraEntries.map(([key, value]) => (
              <tr key={key} className="border-b last:border-b-0">
                <td className="bg-primary/10 font-semibold px-2 py-1.5 capitalize">{key.replace(/-/g, " ")}</td>
                <td className="px-2 py-1.5">{String(value ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {entityUrl && (
        <a
          href={entityUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          View on planning.data.gov.uk
        </a>
      )}
    </div>
  );
}

/** Pretty label formatter: handles abbreviations and snake/kebab case. */
function prettyLabel(key: string): string {
  const cleaned = key.replace(/[_-]+/g, " ").trim();
  return cleaned
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/\b(Lv|Hv|Ehv|Dno|Gsp|Bsp|Psp|Id|Url|Mw|Kw|Kv|Kva|Mva|Ka|Pct|Lsoa|Sfl|Ltds|Ev|Ct)\b/gi, m => m.toUpperCase());
}

/** Format numeric or string values with units where possible. */
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const k = key.toLowerCase();
  // UKPN Grid & Primary Sites raw fields — all MVA
  if (k === "maxdemandsummer" || k === "maxdemandwinter") {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : `${n.toLocaleString()} MVA`;
  }
  if (k === "transratingsummer" || k === "transratingwinter") {
    // Repeating "69.8, 69.8, 69.8, 69.8" → "4 × 69.8 MVA"
    const parts = String(value).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const nums = parts.map(Number).filter(n => !Number.isNaN(n));
    if (nums.length > 1 && nums.every(n => n === nums[0])) {
      return `${nums.length} × ${nums[0]} MVA`;
    }
    if (nums.length >= 1) return `${nums.map(n => n.toLocaleString()).join(", ")} MVA`;
    return String(value);
  }
  if (k === "assessmentdate" || k === "next_assessmentdate" || k === "nextassessmentdate") {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isNaN(num) && typeof value !== "boolean") {
    if (k.includes("length") || k === "shape_length" || k.endsWith("_m")) {
      return num >= 1000 ? `${(num / 1000).toFixed(2)} km` : `${num.toFixed(0)} m`;
    }
    if (k.endsWith("_kv") || k === "voltage_kv") return `${num} kV`;
    if (k.endsWith("_kw")) return `${num.toLocaleString()} kW`;
    if (k.endsWith("_mw")) return `${num.toLocaleString()} MW`;
    if (k.endsWith("_mva")) return `${num.toLocaleString()} MVA`;
    if (k === "voltage_v" || k === "voltage") return num >= 1000 ? `${(num / 1000).toFixed(num >= 10000 ? 0 : 1)} kV` : `${num} V`;
    if (k.includes("pct") || k.includes("percent")) return `${num}%`;
  }
  return String(value);
}

/** Derive voltage class from a layer label like "UKPN HV Cables". */
function voltageClassFromLabel(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes("ehv")) return "EHV (33 – 132 kV)";
  if (/\bhv\b/.test(l) || l.includes("hv cables") || l.includes("hv overhead")) return "HV (6.6 – 22 kV, typ. 11 kV)";
  if (/\blv\b/.test(l) || l.includes("lv cables") || l.includes("lv overhead")) return "LV (≤ 1 kV, typ. 400 V)";
  return null;
}

function GenericInfo({ feature, layerLabel }: { feature: Record<string, unknown>; layerLabel: string }) {
  // UKPN Grid & Primary Sites — surface a Capacity & Headroom summary at the top
  const isUkpnGridPrimary = /grid\s*and\s*primary/i.test(layerLabel) ||
    feature.transratingwinter != null || feature.transratingsummer != null;
  const capacitySummary = isUkpnGridPrimary ? computeUkpnCapacity(feature) : null;

  // UKPN Secondary Sites — surface a headroom-band summary
  const isUkpnSecondary = /secondary\s*site/i.test(layerLabel) ||
    feature.substationalias != null || feature.substationdesign != null;
  const secondarySummary = !capacitySummary && isUkpnSecondary ? computeSecondarySummary(feature) : null;

  // LTDS + connected-circuit lookups for UKPN Grid & Primary Sites (uniform with SubstationInfo)
  const sfl = (feature.sitefunctionallocation ?? feature.functionallocation ?? null) as string | null;
  const siteName = (feature.sitename ?? feature.site_name ?? feature.name ?? null) as string | null;
  const [ltds, setLtds] = useState<any | null>(null);
  const [circuits, setCircuits] = useState<any[] | null>(null);
  useEffect(() => {
    let alive = true;
    setLtds(null);
    if (!isUkpnGridPrimary || !sfl) return;
    (async () => {
      const { data, error } = await supabase.rpc("ukpn_substation_capacity_lookup", { _sfl: sfl });
      if (!alive || error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row && (row.firm_capacity_mva != null || row.peak_true_mw != null || row.peak_observed_mw != null || row.fault_3ph_ka != null)) {
        setLtds(row);
      }
    })();
    return () => { alive = false; };
  }, [isUkpnGridPrimary, sfl]);
  useEffect(() => {
    let alive = true;
    setCircuits(null);
    if (!isUkpnGridPrimary || !siteName || String(siteName).length < 3) return;
    (async () => {
      const { data, error } = await supabase.rpc("ukpn_circuits_for_substation", { p_name: String(siteName) });
      if (!alive || error) return;
      if (Array.isArray(data) && data.length > 0) setCircuits(data);
    })();
    return () => { alive = false; };
  }, [isUkpnGridPrimary, siteName]);

  const PRIORITY = [
    "name", "asset_id", "circuit_id", "feeder_ref",
    "status", "voltage_kv", "voltage", "voltage_v",
    "capacity_value", "capacity_unit", "capacity_flag",
    "line_situation", "conductor", "conductor_type", "material",
    "length_m", "shape_length",
    "local_authority", "licence_area", "substation_type", "substation_class",
    "source_date",
  ];

  const all = Object.entries(feature).filter(
    ([key, val]) => !HIDDEN_KEYS.includes(key.toLowerCase()) && val !== null && val !== undefined && val !== ""
  );

  const priorityEntries = PRIORITY
    .map(k => all.find(([key]) => key.toLowerCase() === k))
    .filter((x): x is [string, unknown] => !!x);
  const usedKeys = new Set(priorityEntries.map(([k]) => k.toLowerCase()));
  const otherEntries = all.filter(([k]) => !usedKeys.has(k.toLowerCase()));
  const ordered = [...priorityEntries, ...otherEntries];

  const voltageClass = voltageClassFromLabel(layerLabel);
  const hasExplicitVoltage = ordered.some(([k]) => /^voltage($|_)/i.test(k));

  if (ordered.length === 0 && !voltageClass) {
    return <p className="text-xs text-muted-foreground">No attributes available.</p>;
  }

  return (
    <div className="space-y-3">
      {capacitySummary && <UkpnCapacityCard summary={capacitySummary} />}
      {secondarySummary && <UkpnSecondaryCard summary={secondarySummary} />}
      {ltds && (
        <div className="rounded-md border bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3 text-primary" /> LTDS Capacity & Headroom
            </p>
            {ltds.year && <Badge variant="outline" className="text-[10px]">{ltds.year}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ltds.firm_capacity_mva != null && (
              <div className="rounded-md border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">Firm Capacity</p>
                <p className="text-sm font-semibold">{Number(ltds.firm_capacity_mva).toLocaleString()} MVA</p>
              </div>
            )}
            {(ltds.peak_true_mw ?? ltds.peak_observed_mw) != null && (
              <div className="rounded-md border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">Peak Demand</p>
                <p className="text-sm font-semibold">{Number(ltds.peak_true_mw ?? ltds.peak_observed_mw).toLocaleString()} MW</p>
              </div>
            )}
            {(ltds.headroom_true_mva ?? ltds.headroom_observed_mva) != null && (
              <div className="rounded-md border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">Headroom</p>
                <p className={`text-sm font-semibold ${Number(ltds.headroom_true_mva ?? ltds.headroom_observed_mva) <= 0 ? "text-red-500" : "text-emerald-600"}`}>
                  {Number(ltds.headroom_true_mva ?? ltds.headroom_observed_mva).toLocaleString()} MVA
                </p>
              </div>
            )}
            {ltds.fault_3ph_ka != null && (
              <div className="rounded-md border bg-background p-2">
                <p className="text-[10px] text-muted-foreground">Fault Level (3ph)</p>
                <p className="text-sm font-semibold">{Number(ltds.fault_3ph_ka).toLocaleString()} kA</p>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Source: UKPN LTDS Tables 2a–4b</p>
        </div>
      )}
      {circuits && circuits.length > 0 && (
        <div className="rounded-md border bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1">
              <Activity className="h-3 w-3 text-primary" /> Connected Circuits — Monthly Peak
            </p>
            <Badge variant="outline" className="text-[10px]">{circuits.length}</Badge>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {circuits.slice(0, 8).map((c, i) => (
              <div key={i} className="rounded-md border bg-background p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{c.circuit_id} <span className="text-muted-foreground font-normal">· {c.voltage_kv} kV</span></span>
                  <span className="font-mono text-[11px]">{c.peak_mw != null ? `${Number(c.peak_mw).toFixed(1)} MW` : "—"}</span>
                </div>
                {c.feeder_description && (
                  <div className="text-[10px] text-muted-foreground truncate">{c.feeder_description}</div>
                )}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{c.from_node} → {c.to_node}</span>
                  <span>12-mo peak: {c.months_12_peak_mw != null ? `${Number(c.months_12_peak_mw).toFixed(1)} MW` : "—"}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Source: UKPN monthly circuit operational data (132/33 kV)</p>
        </div>
      )}
      <div className="rounded-md border overflow-hidden">
      <table className="w-full text-xs">
        <tbody>
          {voltageClass && !hasExplicitVoltage && (
            <tr className="border-b">
              <td className="bg-primary/10 font-semibold px-2 py-1.5 w-2/5">Voltage Class</td>
              <td className="px-2 py-1.5">{voltageClass}</td>
            </tr>
          )}
          {ordered.map(([key, value]) => (
            <tr key={key} className="border-b last:border-b-0">
              <td className="bg-primary/10 font-semibold px-2 py-1.5 w-2/5">{prettyLabel(key)}</td>
              <td className="px-2 py-1.5 break-all">{formatValue(key, value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Parse a transformer rating string like "69.8, 69.8, 69.8, 69.8" into an array of MVA numbers. */
function parseRatings(value: unknown): number[] {
  if (value == null) return [];
  return String(value)
    .split(/[,\s]+/)
    .map(s => Number(s.trim()))
    .filter(n => !Number.isNaN(n) && n > 0);
}

interface UkpnCapacity {
  ratingsSummer: number[];
  ratingsWinter: number[];
  firmSummer: number | null;
  firmWinter: number | null;
  peakSummer: number | null;
  peakWinter: number | null;
  headroomSummer: number | null;
  headroomWinter: number | null;
  utilSummer: number | null;
  utilWinter: number | null;
  worstUtil: number | null;
}

function computeUkpnCapacity(feature: Record<string, unknown>): UkpnCapacity | null {
  const ratingsSummer = parseRatings(feature.transratingsummer);
  const ratingsWinter = parseRatings(feature.transratingwinter);
  const peakSummer = feature.maxdemandsummer != null ? Number(feature.maxdemandsummer) : null;
  const peakWinter = feature.maxdemandwinter != null ? Number(feature.maxdemandwinter) : null;

  if (ratingsSummer.length === 0 && ratingsWinter.length === 0 && peakSummer == null && peakWinter == null) {
    return null;
  }

  // Firm capacity (N-1): sum minus largest. If only one transformer, firm = 0.
  const firm = (arr: number[]): number | null => {
    if (arr.length === 0) return null;
    if (arr.length === 1) return 0;
    const max = Math.max(...arr);
    return arr.reduce((a, b) => a + b, 0) - max;
  };
  const firmSummer = firm(ratingsSummer);
  const firmWinter = firm(ratingsWinter);

  const headroom = (f: number | null, p: number | null) => (f != null && p != null ? f - p : null);
  const util = (p: number | null, f: number | null) => (p != null && f != null && f > 0 ? (p / f) * 100 : null);

  const headroomSummer = headroom(firmSummer, peakSummer);
  const headroomWinter = headroom(firmWinter, peakWinter);
  const utilSummer = util(peakSummer, firmSummer);
  const utilWinter = util(peakWinter, firmWinter);
  const worstUtil = Math.max(utilSummer ?? 0, utilWinter ?? 0) || (utilSummer ?? utilWinter);

  return {
    ratingsSummer, ratingsWinter,
    firmSummer, firmWinter,
    peakSummer, peakWinter,
    headroomSummer, headroomWinter,
    utilSummer, utilWinter,
    worstUtil,
  };
}

function ragColor(util: number | null): { text: string; bg: string; label: string } {
  if (util == null) return { text: "text-muted-foreground", bg: "bg-muted", label: "—" };
  if (util >= 90) return { text: "text-red-600", bg: "bg-red-500", label: "Red" };
  if (util >= 70) return { text: "text-amber-600", bg: "bg-amber-500", label: "Amber" };
  return { text: "text-emerald-600", bg: "bg-emerald-500", label: "Green" };
}

interface SecondarySummary {
  utilBand: string | null;
  headroomBand: string | null;
  utilMidPct: number | null;
  headroomMidPct: number | null;
  voltageKv: string | null;
  transformers: number | null;
  design: string | null;
  rag: { text: string; bg: string; label: string };
  ragSource: "utilisation" | "headroom" | null;
}

/** Parse a band like "0-20%" or "80-100%" → midpoint number. */
function bandMidpoint(band: unknown): number | null {
  if (band == null) return null;
  const m = String(band).match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/i);
  if (!m) {
    const single = String(band).match(/(\d+(?:\.\d+)?)/);
    return single ? Number(single[1]) : null;
  }
  return (Number(m[1]) + Number(m[2])) / 2;
}

function computeSecondarySummary(feature: Record<string, unknown>): SecondarySummary | null {
  const utilBand = (feature.utilisation_band ?? feature.utilisationband ?? feature["utilisation band"] ?? null) as string | null;
  const headroomBand = (feature.demand_headroom ?? feature.demandheadroom ?? feature["demand headroom"] ?? null) as string | null;
  const voltageKv = (feature.substationvoltage ?? feature.voltage_kv ?? null) as string | null;
  const transformers = feature.numberoftransformers != null ? Number(feature.numberoftransformers) : null;
  const design = (feature.substationdesign ?? null) as string | null;

  if (!utilBand && !headroomBand && !voltageKv && transformers == null) return null;

  const utilMidPct = bandMidpoint(utilBand);
  const headroomMidPct = bandMidpoint(headroomBand);

  // Prefer utilisation for RAG; otherwise infer from headroom band (high headroom = low util).
  let rag = ragColor(null);
  let ragSource: "utilisation" | "headroom" | null = null;
  if (utilMidPct != null) {
    rag = ragColor(utilMidPct);
    ragSource = "utilisation";
  } else if (headroomMidPct != null) {
    rag = ragColor(100 - headroomMidPct);
    ragSource = "headroom";
  }

  return { utilBand, headroomBand, utilMidPct, headroomMidPct, voltageKv: voltageKv ? String(voltageKv) : null, transformers, design, rag, ragSource };
}

function UkpnSecondaryCard({ summary }: { summary: SecondarySummary }) {
  const designLabel: Record<string, string> = {
    GMT: "Ground-Mounted",
    PMT: "Pole-Mounted",
    KIOSK: "Kiosk",
  };
  const dKey = (summary.design ?? "").toUpperCase();

  // Typical UKPN secondary transformer ratings (kVA) by design type
  const typicalKva: Record<string, number> = { GMT: 500, KIOSK: 315, PMT: 100 };
  const assumedKva = typicalKva[dKey] ?? 500;
  const n = summary.transformers ?? 1;
  const installedKva = n * assumedKva;
  const installedMva = installedKva / 1000;

  // Estimate spare MVA from headroom band; fall back to (100 − utilisation) when headroom missing.
  let spareLowPct: number | null = null;
  let spareHighPct: number | null = null;
  const hbMatch = summary.headroomBand ? String(summary.headroomBand).match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/i) : null;
  if (hbMatch) {
    spareLowPct = Number(hbMatch[1]);
    spareHighPct = Number(hbMatch[2]);
  } else if (summary.utilBand) {
    const ubMatch = String(summary.utilBand).match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/i);
    if (ubMatch) {
      spareLowPct = 100 - Number(ubMatch[2]);
      spareHighPct = 100 - Number(ubMatch[1]);
    }
  }
  const spareMinMva = spareLowPct != null ? (installedMva * spareLowPct) / 100 : null;
  const spareMaxMva = spareHighPct != null ? (installedMva * spareHighPct) / 100 : null;

  const fmtMva = (n: number | null) => n == null ? "—" : `${n.toFixed(2)} MVA`;
  const fmtKw = (mva: number | null) => mva == null ? "—" : `${Math.round(mva * 1000 * 0.95).toLocaleString()} kW`; // 0.95 pf

  return (
    <div className="rounded-md border bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold flex items-center gap-1">
          <Zap className="h-3 w-3 text-primary" /> Headroom Summary
        </p>
        <Badge variant="outline" className="text-[10px]">
          <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${summary.rag.bg}`} />
          {summary.rag.label}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {summary.headroomBand && (
          <div className="rounded border bg-background p-2">
            <p className="text-[10px] text-muted-foreground">Demand headroom</p>
            <p className="text-sm font-semibold text-emerald-600">{summary.headroomBand}</p>
            <p className="text-[10px] text-muted-foreground">spare capacity remaining</p>
          </div>
        )}
        {summary.utilBand && (
          <div className="rounded border bg-background p-2">
            <p className="text-[10px] text-muted-foreground">Utilisation</p>
            <p className="text-sm font-semibold">{summary.utilBand}</p>
            <p className="text-[10px] text-muted-foreground">of firm rating</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {summary.voltageKv && <Badge variant="secondary" className="text-[10px]">{summary.voltageKv}</Badge>}
        {summary.transformers != null && <Badge variant="secondary" className="text-[10px]">{summary.transformers} transformer{summary.transformers === 1 ? "" : "s"}</Badge>}
        {summary.design && <Badge variant="secondary" className="text-[10px]">{designLabel[dKey] ?? summary.design}</Badge>}
      </div>

      {/* Estimated spare MVA — formula box */}
      <div className="rounded border bg-background p-2 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Estimated spare capacity</p>
        <div className="text-sm font-semibold text-emerald-600">
          {spareMinMva != null && spareMaxMva != null
            ? `≈ ${fmtMva(spareMinMva)} – ${fmtMva(spareMaxMva)}`
            : "—"}
        </div>
        {spareMinMva != null && spareMaxMva != null && (
          <p className="text-[10px] text-muted-foreground">≈ {fmtKw(spareMinMva)} – {fmtKw(spareMaxMva)} at 0.95 pf</p>
        )}
        <div className="border-t pt-1.5 mt-1 space-y-0.5">
          <p className="text-[10px] text-muted-foreground font-mono">
            Installed ≈ {n} × {assumedKva} kVA = <span className="font-semibold text-foreground">{installedMva.toFixed(2)} MVA</span>
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">
            Spare = Installed × Headroom% {spareLowPct != null && spareHighPct != null ? `= ${installedMva.toFixed(2)} × ${spareLowPct}–${spareHighPct}%` : ""}
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Indicative only — assumes typical {designLabel[dKey] ?? "secondary"} rating of {assumedKva} kVA per transformer. Actual nameplate rating may differ; confirm with UKPN before commitment.
        </p>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Source: UKPN Secondary Sites register. Headroom bands are UKPN-published thermal ratings; for exact MVA figures use the LV Capacity Map.
      </p>
    </div>
  );
}

function UkpnCapacityCard({ summary }: { summary: UkpnCapacity }) {
  const fmt = (n: number | null, suffix = " MVA") => n == null ? "—" : `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
  const rag = ragColor(summary.worstUtil);
  return (
    <div className="rounded-md border bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold flex items-center gap-1">
          <Zap className="h-3 w-3 text-primary" /> Capacity & Headroom (N-1)
        </p>
        <Badge variant="outline" className="text-[10px]">
          <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${rag.bg}`} />
          {rag.label}{summary.worstUtil != null ? ` · ${summary.worstUtil.toFixed(0)}%` : ""}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div />
        <div className="text-[10px] text-muted-foreground text-center">Summer</div>
        <div className="text-[10px] text-muted-foreground text-center">Winter</div>

        <div className="text-[10px] text-muted-foreground self-center">Firm capacity</div>
        <div className="rounded border bg-background p-1.5 text-center font-semibold">{fmt(summary.firmSummer)}</div>
        <div className="rounded border bg-background p-1.5 text-center font-semibold">{fmt(summary.firmWinter)}</div>

        <div className="text-[10px] text-muted-foreground self-center">Peak demand</div>
        <div className="rounded border bg-background p-1.5 text-center font-semibold">{fmt(summary.peakSummer)}</div>
        <div className="rounded border bg-background p-1.5 text-center font-semibold">{fmt(summary.peakWinter)}</div>

        <div className="text-[10px] text-muted-foreground self-center">Headroom</div>
        <div className={`rounded border bg-background p-1.5 text-center font-semibold ${summary.headroomSummer != null && summary.headroomSummer <= 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(summary.headroomSummer)}</div>
        <div className={`rounded border bg-background p-1.5 text-center font-semibold ${summary.headroomWinter != null && summary.headroomWinter <= 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(summary.headroomWinter)}</div>

        <div className="text-[10px] text-muted-foreground self-center">Utilisation</div>
        <div className="rounded border bg-background p-1.5 text-center font-semibold">{summary.utilSummer != null ? `${summary.utilSummer.toFixed(0)}%` : "—"}</div>
        <div className="rounded border bg-background p-1.5 text-center font-semibold">{summary.utilWinter != null ? `${summary.utilWinter.toFixed(0)}%` : "—"}</div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Firm = N-1 (sum of transformer ratings − largest). Values in MVA. Source: UKPN Grid & Primary Sites register.
      </p>
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
  const isPlanningData = !!feature.entity && (!!feature.dataset || !!feature.prefix);
  const isSubstationArea = layerLabel.toLowerCase().includes("heat map") || layerLabel.toLowerCase().includes("substation area");
  const isSubstation = !isSubstationArea && !isPlanningData && (layerLabel.toLowerCase().includes("substation") || !!feature.utilisation_pct);

  const renderContent = () => {
    if (isPlanningData) return <PlanningInfo feature={feature} layerLabel={layerLabel} />;
    if (isSubstationArea) return <SubstationAreaInfo feature={feature} />;
    if (isSubstation) return <SubstationInfo feature={feature} />;
    return <GenericInfo feature={feature} layerLabel={layerLabel} />;
  };

  return (
    <div className="absolute bottom-4 left-3 z-10 w-[22rem] max-w-[calc(100vw-2rem)]">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-primary/5">
          <span className="text-sm font-semibold text-foreground truncate">{layerLabel}</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="max-h-[50vh] overflow-y-auto">
          <div className="px-3 py-2">
            {renderContent()}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

