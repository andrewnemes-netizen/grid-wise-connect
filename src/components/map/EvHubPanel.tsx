/**
 * EV Hub Feasibility Panel — runs the EV Hub engine from a pin drop location
 * and displays the structured output (feasibility state, earthing, reinforcement, BOQ, audit).
 */
import { useState, useCallback } from "react";
import {
  X, Zap, Loader2, AlertTriangle, CheckCircle, XCircle, ShieldAlert,
  ChevronDown, ChevronUp, Wrench, FileText, Activity, Shield, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { runEvHubEngine, type EngineContext } from "@/lib/evHub/engine";
import type { EvHubEngineOutput, FeasibilityState, DnoKey } from "@/lib/evHub/types";
import { supabase } from "@/integrations/supabase/client";

export interface ConnectData {
  routeCoords: [number, number][];
  routeLengthM: number;
  sourceProperties: Record<string, unknown>;
  sourceLayerLabel: string;
}

interface Props {
  lng: number;
  lat: number;
  onClose: () => void;
  connectData?: ConnectData | null;
  /** Design cables to feed as POC candidates */
  designCables?: { cable_type: string; coordinates: [number, number][]; length_m: number; label: string | null }[];
}

const STATE_CONFIG: Record<FeasibilityState, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  LV_OK: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "LV Connection Feasible" },
  DNO_STUDY_REQUIRED: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "DNO Study Required" },
  ENGINEERING_REVIEW_REQUIRED: { icon: ShieldAlert, color: "text-orange-600", bg: "bg-orange-50 border-orange-200", label: "Engineering Review Required" },
  LV_REINFORCEMENT_REQUIRED: { icon: Wrench, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "LV Reinforcement Required" },
  HV_CONNECTION_REQUIRED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "HV Connection Required" },
};

const DNO_OPTIONS: { value: DnoKey; label: string }[] = [
  { value: "UKPN", label: "UKPN" },
  { value: "NPG", label: "NPG" },
  { value: "ENWL", label: "ENWL" },
  { value: "NGED", label: "NGED" },
  { value: "SPEN", label: "SPEN" },
  { value: "SSEN", label: "SSEN" },
];

export function EvHubPanel({ lng, lat, onClose, connectData, designCables }: Props) {
  const { toast } = useToast();

  // Inputs
  const [chargerCount, setChargerCount] = useState("4");
  const [chargerKw, setChargerKw] = useState("50");
  const [diversityFactor, setDiversityFactor] = useState("0.8");
  const [extraneous, setExtraneous] = useState(false);
  const [dnoOverride, setDnoOverride] = useState<DnoKey | "auto">("auto");

  // State
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvHubEngineOutput | null>(null);
  const [boqOpen, setBoqOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const handleRun = useCallback(async () => {
    setLoading(true);
    try {
      let dnoLookupResult: string | undefined;

      if (dnoOverride === "auto") {
        const { data, error } = await supabase.rpc("lookup_dno_by_location", {
          p_lat: lat,
          p_lng: lng,
        });
        if (error) {
          toast({ title: "DNO lookup failed", description: error.message, variant: "destructive" });
          setLoading(false);
          return;
        }
        dnoLookupResult = data ?? undefined;
        if (!dnoLookupResult) {
          toast({ title: "DNO not found", description: "No DNO licence area found for this location. Please select a DNO manually.", variant: "destructive" });
          setLoading(false);
          return;
        }
      } else {
        dnoLookupResult = dnoOverride;
      }

      const context: EngineContext = {
        dnoLookupResult,
      };

      // ── Integrate Connect tool data if available ──
      if (connectData) {
        // Classify route as footway by default (could be enhanced with surface detection)
        context.routeSegments = [{
          coordinates: connectData.routeCoords,
          surface_type: "FOOTWAY",
          length_m: connectData.routeLengthM,
        }];

        // Extract substation headroom from source properties if available
        const headroomKw = connectData.sourceProperties?.headroom_kw as number | undefined;
        const capacityKw = connectData.sourceProperties?.capacity_kw as number | undefined;
        const utilisationPct = connectData.sourceProperties?.utilisation_pct as number | undefined;

        if (headroomKw != null) {
          context.networkHeadroomKva = headroomKw; // kW ≈ kVA for rough estimates
        }
        if (capacityKw != null) {
          context.transformerCapacityKva = capacityKw;
        }
        if (utilisationPct != null) {
          context.transformerLoadingPct = utilisationPct;
        }
      }

      // ── Integrate design cables as POC candidates ──
      if (designCables && designCables.length > 0) {
        context.cableCandidates = designCables
          .filter(c => c.cable_type === "lv_main" || c.cable_type === "lv_service")
          .map(c => ({
            cable_segment_id: `design-${c.label || c.cable_type}`,
            distance_m: c.length_m,
            capacity_headroom_pct: null,
            age_years: null,
            accessibility_score: null,
          }));
      }

      const output = await runEvHubEngine(
        {
          site_lat: lat,
          site_lng: lng,
          charger_count: Number(chargerCount) || 4,
          charger_kw_each: Number(chargerKw) || 50,
          diversity_factor: Number(diversityFactor) || 1.0,
          extraneous_within_2p5m: extraneous,
          lv_cable_layer_available: false,
          dno_override: dnoOverride !== "auto" ? dnoOverride : undefined,
        },
        context
      );
      setResult(output);
    } catch (err: any) {
      toast({ title: "Engine error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [lat, lng, chargerCount, chargerKw, diversityFactor, extraneous, dnoOverride, connectData, toast]);

  const stateConfig = result ? STATE_CONFIG[result.feasibility_state] : null;

  return (
    <div className="absolute top-0 right-0 z-20 h-full w-[420px] border-l bg-background shadow-xl flex flex-col pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">EV Hub Feasibility</span>
          <Badge variant="outline" className="text-[10px]">V1 Framework</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Location */}
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Location</p>
            <p className="text-sm font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
          </div>

          {/* Connect data indicator */}
          {connectData && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Connect Route Data</p>
              <div className="flex items-center gap-3 text-xs">
                <span>Route: <strong>{Math.round(connectData.routeLengthM).toLocaleString()} m</strong></span>
                {(connectData.sourceProperties?.headroom_kw as number | undefined) != null && (
                  <span>Headroom: <strong>{(connectData.sourceProperties.headroom_kw as number).toLocaleString()} kW</strong></span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">From: {connectData.sourceLayerLabel}</p>
            </div>
          )}

          {/* Inputs */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Charger Count</Label>
                <Input type="number" value={chargerCount} onChange={(e) => setChargerCount(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">kW per Charger</Label>
                <Input type="number" value={chargerKw} onChange={(e) => setChargerKw(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Diversity Factor</Label>
                <Input type="number" step="0.05" value={diversityFactor} onChange={(e) => setDiversityFactor(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">DNO</Label>
                <Select value={dnoOverride} onValueChange={(v) => setDnoOverride(v as DnoKey | "auto")}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    {DNO_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="text-xs">Extraneous conductive parts within 2.5m?</Label>
              <Switch checked={extraneous} onCheckedChange={setExtraneous} />
            </div>
          </div>

          {/* ── RESULTS ── */}
          {result && stateConfig && (
            <>
              {/* Feasibility State */}
              <div className={`rounded-lg border p-4 ${stateConfig.bg}`}>
                <div className="flex items-center gap-3">
                  <stateConfig.icon className={`h-7 w-7 ${stateConfig.color}`} />
                  <div>
                    <p className={`text-sm font-bold ${stateConfig.color}`}>{result.feasibility_state}</p>
                    <p className={`text-xs ${stateConfig.color}`}>{stateConfig.label}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* DNO & Electrical */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Electrical Sizing</p>
                </div>
                <div className="rounded-md border bg-muted/10 p-3 space-y-1">
                  <Row label="DNO" value={result.dno_anchor.dno_key} />
                  <Row label="Rule Set" value={result.dno_anchor.rule_set_id} />
                  <Row label="Total Demand" value={`${result.electrical_sizing.total_demand_kva.toFixed(1)} kVA`} />
                  <Row label="Service Cable" value={result.electrical_sizing.service_cable} />
                  <Row label="LV Main" value={result.electrical_sizing.lv_main_cable} />
                  <Row label="Protection" badge={result.electrical_sizing.protection_grading.status} />
                </div>
              </div>

              <Separator />

              {/* Earthing */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Earthing</p>
                </div>
                <div className="rounded-md border bg-muted/10 p-3 space-y-1">
                  <Row label="Selected" value={result.earthing.selected} />
                  <Row label="Review Required" badge={result.earthing.review_required ? "YES" : "NO"} badgeVariant={result.earthing.review_required ? "destructive" : "outline"} />
                  {result.earthing.warnings.map((w, i) => (
                    <p key={i} className="text-[10px] text-amber-600">{w}</p>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Reinforcement */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reinforcement</p>
                </div>
                <div className="rounded-md border bg-muted/10 p-3 space-y-1">
                  <Row label="State" badge={result.reinforcement.state} />
                  <Row label="Headroom" value={result.reinforcement.headroom_remaining_kva != null ? `${result.reinforcement.headroom_remaining_kva.toFixed(1)} kVA` : "N/A"} />
                  <Row label="Fault Level OK" value={result.reinforcement.fault_level_ok != null ? (result.reinforcement.fault_level_ok ? "Yes" : "No") : "N/A"} />
                </div>
              </div>

              <Separator />

              {/* BOQ (collapsible) */}
              <Collapsible open={boqOpen} onOpenChange={setBoqOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full text-xs h-7">
                    {boqOpen ? <ChevronUp className="mr-1.5 h-3 w-3" /> : <ChevronDown className="mr-1.5 h-3 w-3" />}
                    <FileText className="mr-1 h-3 w-3" /> Bill of Quantities ({[...result.boq.electrical, ...result.boq.civils, ...result.boq.traffic_mgmt, ...result.boq.fees].length} items)
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-2">
                  {(["electrical", "civils", "traffic_mgmt", "fees"] as const).map((cat) => {
                    const items = result.boq[cat];
                    if (items.length === 0) return null;
                    return (
                      <div key={cat} className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">{cat.replace("_", " ")}</p>
                        {items.map((item) => (
                          <div key={item.item_code} className="flex items-center justify-between text-[11px] px-2 py-0.5 rounded bg-muted/20">
                            <span className="text-muted-foreground">{item.description}</span>
                            <span className="font-mono font-medium">{item.quantity} {item.unit}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>

              {/* Audit (collapsible) */}
              <Collapsible open={auditOpen} onOpenChange={setAuditOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full text-xs h-7">
                    {auditOpen ? <ChevronUp className="mr-1.5 h-3 w-3" /> : <ChevronDown className="mr-1.5 h-3 w-3" />}
                    <Truck className="mr-1 h-3 w-3" /> Audit Trace
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-2">
                  {result.audit.reason_codes.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Reason Codes</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.audit.reason_codes.map((c) => <Badge key={c} variant="outline" className="text-[9px]">{c}</Badge>)}
                      </div>
                    </div>
                  )}
                  {result.audit.warnings.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Warnings</p>
                      {result.audit.warnings.map((w, i) => <p key={i} className="text-[10px] text-amber-600">{w}</p>)}
                    </div>
                  )}
                  {result.audit.pending_fields.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Pending Fields</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.audit.pending_fields.map((f) => <Badge key={f} variant="secondary" className="text-[9px]">{f}</Badge>)}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Engine Version</p>
                    <p className="text-[10px] font-mono">{result.audit.engine_version}</p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Sticky footer button */}
      <div className="p-4 border-t">
        <Button onClick={handleRun} disabled={loading} className="w-full">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running Engine…</> : <><Zap className="mr-2 h-4 w-4" />Run Feasibility</>}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, badge, badgeVariant }: { label: string; value?: string; badge?: string; badgeVariant?: "default" | "secondary" | "destructive" | "outline" }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {badge ? <Badge variant={badgeVariant || "outline"} className="text-[10px]">{badge}</Badge> : <span className="font-medium text-xs">{value}</span>}
    </div>
  );
}
