import { useState, useMemo } from "react";
import { X, Cable, Zap, Loader2, AlertTriangle, CheckCircle, XCircle, Download, Save, Activity, Shield, FileJson, Paintbrush } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VoltageOverride, CostEstimate } from "@/lib/connectionCosts";
import { estimateConnectionCost } from "@/lib/connectionCosts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUnitRates } from "@/hooks/useUnitRates";
import { CostEstimatePanel } from "./CostEstimatePanel";
import { OptimiserResultPanel } from "./OptimiserResultPanel";
import { generateAssessmentPdf, exportAssessmentJson } from "@/lib/generateAssessmentPdf";
import { SavedAssessmentsDrawer } from "./SavedAssessmentsDrawer";
import { AssessmentComparisonPanel } from "./AssessmentComparisonPanel";
import { runLvOptimiser, type OptimiserResult, type CableCatalogueEntry } from "@/lib/lvOptimiser";
import { runElectricalValidation, type ElectricalValidationResult } from "@/lib/electricalEngine";
import { createSnapshot } from "@/lib/snapshotService";
import { runVoltageComparison, type VoltageComparisonResult } from "@/lib/voltageComparison";
import { VoltageComparisonPanel } from "./VoltageComparisonPanel";

export interface ConnectEndpoints {
  source: {
    lngLat: [number, number];
    properties: Record<string, unknown>;
    layerLabel: string;
  };
  destination: {
    lngLat: [number, number];
  };
  routeCoords: [number, number][];
}

interface ConnectAssessmentPanelProps {
  endpoints: ConnectEndpoints;
  onClose: () => void;
  onCaptureMapScreenshot?: () => Promise<string | null>;
  streetViewCaptures?: { dataUrl: string; heading: number; pitch: number; label: string }[];
  designElements?: { type: string; label: string; count: number }[];
  /** Whether an active study exists (required for design conversion) */
  hasActiveStudy?: boolean;
  /** Bulk insert callback from useDesignMode */
  onConvertToDesign?: (
    elements: { element_type: string; label: string; lng: number; lat: number; properties_json: Record<string, unknown> }[],
    cables: { cable_type: string; label: string; coordinates: [number, number][] }[]
  ) => Promise<number>;
}

export interface SavedAssessment {
  id: string;
  label: string;
  timestamp: Date;
  endpoints: ConnectEndpoints;
  proposedKw: number;
  voltageOverride: VoltageOverride;
  result: ScoreResult;
  distances: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  totalEstimate: number;
  voltageLevel: string;
  confidence: string;
  costEstimate?: CostEstimate;
}

/** Haversine distance in metres */
function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

interface ScoreResult {
  score: string;
  reasons: string[];
  next_steps: string[];
  distances?: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  constraints?: {
    ndp_intersect: boolean;
    ndp_within_1000m: boolean;
    wayleave_intersect: boolean;
    capacity_flag: string;
    min_footway_m: number | null;
    min_carriageway_m: number | null;
  };
}

const scoreConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  GREEN: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Viable" },
  AMBER: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Possible" },
  RED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Challenging" },
};

const OPTION_LETTERS = "ABCDEFGHIJ";

export function ConnectAssessmentPanel({ endpoints, onClose, onCaptureMapScreenshot, streetViewCaptures, designElements }: ConnectAssessmentPanelProps) {
  const { toast } = useToast();
  const [proposedKw, setProposedKw] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [voltageOverride, setVoltageOverride] = useState<VoltageOverride>("Auto");

  // LV Optimiser state
  const [optimiserResult, setOptimiserResult] = useState<OptimiserResult | null>(null);
  const [electricalResult, setElectricalResult] = useState<ElectricalValidationResult | null>(null);
  const [optimiserLoading, setOptimiserLoading] = useState(false);
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null);
  const { data: unitRates } = useUnitRates();

  // Fetch cable catalogue for optimiser (LV + HV)
  const { data: cableCatalogue } = useQuery({
    queryKey: ["cable-catalogue-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cable_catalogue")
        .select("*");
      if (error) throw error;
      return (data || []) as CableCatalogueEntry[];
    },
  });

  // Voltage comparison state
  const [comparisonResult, setComparisonResult] = useState<VoltageComparisonResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  // Save & compare state
  const [savedAssessments, setSavedAssessments] = useState<SavedAssessment[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[] | null>(null);

  // Calculate route distance
  const routeDistanceM = useMemo(() => {
    const coords = endpoints.routeCoords;
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      total += haversineM(coords[i - 1], coords[i]);
    }
    return Math.round(total);
  }, [endpoints.routeCoords]);

  const straightLineM = useMemo(
    () => Math.round(haversineM(endpoints.source.lngLat, endpoints.destination.lngLat)),
    [endpoints]
  );

  const sourceName =
    (endpoints.source.properties.site_name as string) ||
    (endpoints.source.properties.name as string) ||
    (endpoints.source.properties.asset_id as string) ||
    endpoints.source.layerLabel;

  const sourceHeadroomKw = endpoints.source.properties.transformer_headroom_kw as number | undefined ??
    endpoints.source.properties.headroom_kw as number | undefined;

  const handleAssess = async () => {
    setLoading(true);
    try {
      const [dstLng, dstLat] = endpoints.destination.lngLat;
      const res = await supabase.functions.invoke("score-site", {
        body: {
          lng: dstLng,
          lat: dstLat,
          proposed_kw: Number(proposedKw) || 0,
          site_name: `Connection from ${sourceName}`,
        },
      });
      if (res.error) throw res.error;
      setResult(res.data);
    } catch (err: any) {
      toast({ title: "Assessment failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Build distance overrides using route measurement
  // When a route has been drawn (routeDistanceM > 0), use the drawn route distance
  // as the cable length since it represents the actual measured route, not straight-line.
  const distances = useMemo(() => {
    const hasDrawnRoute = routeDistanceM > 0;
    if (result?.distances) {
      return {
        ...result.distances,
        primary_m: hasDrawnRoute ? routeDistanceM : result.distances.primary_m,
        feeder_m: hasDrawnRoute ? routeDistanceM : result.distances.feeder_m,
        capacity_segment_m: hasDrawnRoute ? routeDistanceM : result.distances.capacity_segment_m,
      };
    }
    return { primary_m: routeDistanceM, feeder_m: routeDistanceM, capacity_segment_m: routeDistanceM };
  }, [result, routeDistanceM]);

  const sc = result ? scoreConfig[result.score] || scoreConfig.AMBER : null;

  // Save current assessment
  const handleSave = () => {
    if (!result) return;
    if (savedAssessments.length >= 10) {
      toast({ title: "Max 10 saved", description: "Delete an option before saving more.", variant: "destructive" });
      return;
    }
    const kw = Number(proposedKw) || 0;
    const costEst = kw > 0
      ? estimateConnectionCost({
          proposed_kw: kw,
          distances,
          constraints: result.constraints,
          nearest_headroom_kw: sourceHeadroomKw,
          voltage_override: voltageOverride,
        })
      : undefined;

    const letter = OPTION_LETTERS[savedAssessments.length] ?? String(savedAssessments.length + 1);
    const saved: SavedAssessment = {
      id: crypto.randomUUID(),
      label: `Option ${letter} — ${voltageOverride === "Auto" ? (costEst?.voltage_level ?? "Auto") : voltageOverride} ${kw}kW`,
      timestamp: new Date(),
      endpoints: { ...endpoints },
      proposedKw: kw,
      voltageOverride,
      result,
      distances,
      totalEstimate: costEst?.total_estimate ?? 0,
      voltageLevel: costEst?.voltage_level ?? voltageOverride,
      confidence: costEst?.confidence ?? "low",
      costEstimate: costEst,
    };
    setSavedAssessments((prev) => [...prev, saved]);
    toast({ title: `Saved as ${saved.label}` });
  };

  const handleDelete = (id: string) => {
    setSavedAssessments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleCompare = (ids: string[]) => {
    setComparisonIds(ids);
  };

  // Comparison mode
  if (comparisonIds) {
    const selected = savedAssessments.filter((a) => comparisonIds.includes(a.id));
    return (
      <AssessmentComparisonPanel
        assessments={selected}
        onBack={() => setComparisonIds(null)}
      />
    );
  }

  return (
    <div className="absolute top-0 right-0 z-20 h-full w-96 border-l bg-background shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Cable className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Connection Assessment</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Source asset */}
          <div className="rounded-md border bg-muted/20 p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Source Asset</p>
            <p className="text-sm font-semibold">{sourceName}</p>
            <p className="text-xs text-muted-foreground">{endpoints.source.layerLabel}</p>
            {sourceHeadroomKw !== undefined && (
              <p className="text-xs">Headroom: <span className="font-medium">{sourceHeadroomKw.toLocaleString()} kW</span></p>
            )}
          </div>

          {/* Destination */}
          <div className="rounded-md border bg-muted/20 p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Destination</p>
            <p className="text-sm font-mono">
              {endpoints.destination.lngLat[1].toFixed(5)}, {endpoints.destination.lngLat[0].toFixed(5)}
            </p>
          </div>

          {/* Route distance */}
          <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Route Distance</p>
            <p className="text-2xl font-bold text-foreground">{routeDistanceM.toLocaleString()} m</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px]">
                {routeDistanceM < 500 ? "Close" : routeDistanceM < 1500 ? "Medium" : "Far"}
              </Badge>
              {endpoints.routeCoords.length > 2 && (
                <span className="text-[10px] text-muted-foreground">
                  {endpoints.routeCoords.length - 2} waypoint{endpoints.routeCoords.length - 2 !== 1 ? "s" : ""} · Straight: {straightLineM.toLocaleString()} m
                </span>
              )}
            </div>
          </div>

          {/* Proposed kW input */}
          <div className="space-y-1">
            <Label className="text-xs">Proposed Load (kW)</Label>
            <Input
              type="number"
              value={proposedKw}
              onChange={(e) => setProposedKw(e.target.value)}
              placeholder="e.g. 250"
              className="h-8 text-sm"
            />
          </div>

          {/* Connection Voltage selector */}
          <div className="space-y-1">
            <Label className="text-xs">Connection Voltage</Label>
            <Select value={voltageOverride} onValueChange={(v) => setVoltageOverride(v as VoltageOverride)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Auto">Auto (from kW)</SelectItem>
                <SelectItem value="LV">LV — Feeder pillar + cutout</SelectItem>
                <SelectItem value="HV">HV — RMU + CT metering</SelectItem>
                <SelectItem value="EHV">EHV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleAssess} disabled={loading} className="w-full">
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Assessing…</>
            ) : (
              <><Zap className="mr-2 h-4 w-4" />Assess Feasibility &amp; Cost</>
            )}
          </Button>

          {/* Results */}
          {result && sc && (
            <>
              <Separator />

              {/* Score card */}
              <div className={`rounded-lg border p-4 ${sc.bg}`}>
                <div className="flex items-center gap-3">
                  <sc.icon className={`h-6 w-6 ${sc.color}`} />
                  <div>
                    <span className={`text-lg font-bold ${sc.color}`}>{result.score}</span>
                    <p className={`text-xs ${sc.color}`}>{sc.label}</p>
                  </div>
                </div>
              </div>

              {/* Constraints */}
              {result.constraints && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Constraints</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NDP Intersect</span>
                      <Badge variant={result.constraints.ndp_intersect ? "destructive" : "outline"}>
                        {result.constraints.ndp_intersect ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Wayleave</span>
                      <Badge variant={result.constraints.wayleave_intersect ? "destructive" : "outline"}>
                        {result.constraints.wayleave_intersect ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capacity</span>
                      <Badge variant="outline">{result.constraints.capacity_flag}</Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Cost Estimate */}
              {Number(proposedKw) > 0 && (
                <>
                  <Separator />
                  <CostEstimatePanel
                    proposed_kw={Number(proposedKw)}
                    distances={distances}
                    constraints={result.constraints}
                    nearest_headroom_kw={sourceHeadroomKw}
                    voltageOverride={voltageOverride}
                  />
                </>
              )}

              {/* LV Optimiser */}
              {Number(proposedKw) > 0 && (voltageOverride === "Auto" || voltageOverride === "LV") && (
                <>
                  <Separator />
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={optimiserLoading || !cableCatalogue?.length}
                    onClick={() => {
                      if (!cableCatalogue?.length) return;
                      setOptimiserLoading(true);
                      try {
                        const kw = Number(proposedKw);
                        const optRes = runLvOptimiser({
                          proposed_kw: kw,
                          route_length_m: routeDistanceM,
                          catalogue: cableCatalogue,
                          unit_rates: unitRates,
                        });
                        setOptimiserResult(optRes);

                        // Run electrical validation using selected solution
                        const sel = optRes.selected;
                        if (sel) {
                          const mains = sel.network_edges.find(e => e.section === "mains")!;
                          const service = sel.network_edges.find(e => e.section === "service")!;
                          const elecRes = runElectricalValidation({
                            proposed_kw: kw,
                            mains_length_m: mains.length_m,
                            service_length_m: service.length_m,
                            mains_impedance_per_km: mains.impedance_per_km,
                            service_impedance_per_km: service.impedance_per_km,
                            mains_rating_a: mains.current_rating_a,
                            service_rating_a: service.current_rating_a,
                          });
                          setElectricalResult(elecRes);
                        }
                      } catch (err: any) {
                        toast({ title: "Optimiser error", description: err.message, variant: "destructive" });
                      } finally {
                        setOptimiserLoading(false);
                      }
                    }}
                  >
                    {optimiserLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running…</>
                    ) : (
                      <><Activity className="mr-2 h-4 w-4" />Run LV Feasibility</>
                    )}
                  </Button>
                  {optimiserResult && <OptimiserResultPanel result={optimiserResult} />}

                  {/* Electrical validation summary */}
                  {electricalResult && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Electrical Validation</span>
                        <Badge variant={electricalResult.overall_pass ? "outline" : "destructive"} className="ml-auto text-[10px]">
                          {electricalResult.overall_pass ? "PASS" : "FAIL"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <span className="text-muted-foreground">VD Total</span>
                        <span className="font-medium text-right">{electricalResult.voltage_drop.total_vd_pct}%</span>
                        <span className="text-muted-foreground">Design Current</span>
                        <span className="font-medium text-right">{electricalResult.current.design_current_a}A</span>
                        <span className="text-muted-foreground">Fault Current</span>
                        <span className="font-medium text-right">{electricalResult.fault_level.prospective_fault_current_a}A</span>
                        <span className="text-muted-foreground">Zs</span>
                        <span className="font-medium text-right">{electricalResult.fault_level.zs_total_ohms}Ω</span>
                      </div>
                      {electricalResult.flags.length > 0 && (
                        <div className="space-y-0.5">
                          {electricalResult.flags.map((f, i) => (
                            <div key={i} className={`text-[10px] flex items-start gap-1 ${f.severity === "error" ? "text-destructive" : "text-amber-600"}`}>
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                              {f.message}
                            </div>
                          ))}
                        </div>
              )}

              {/* Voltage Comparison */}
              {Number(proposedKw) > 0 && (
                <>
                  <Separator />
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={comparisonLoading || !cableCatalogue?.length}
                    onClick={() => {
                      if (!cableCatalogue?.length) return;
                      setComparisonLoading(true);
                      try {
                        const res = runVoltageComparison({
                          proposed_kw: Number(proposedKw),
                          route_length_m: routeDistanceM,
                          catalogue: cableCatalogue,
                          unit_rates: unitRates,
                        });
                        setComparisonResult(res);
                      } catch (err: any) {
                        toast({ title: "Comparison error", description: err.message, variant: "destructive" });
                      } finally {
                        setComparisonLoading(false);
                      }
                    }}
                  >
                    {comparisonLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Comparing…</>
                    ) : (
                      <><Zap className="mr-2 h-4 w-4" />Compare All Voltages</>
                    )}
                  </Button>
                  {comparisonResult && <VoltageComparisonPanel result={comparisonResult} />}
                </>
              )}
                      <p className="text-[9px] text-muted-foreground">Engine {electricalResult.engine_version}{lastSnapshotId ? ` · Snapshot ${lastSnapshotId.slice(0, 8)}` : ""}</p>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assessment Reasons</p>
                <ul className="space-y-1">
                  {result.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Next Steps */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommended Next Steps</p>
                <ul className="space-y-1">
                  {result.next_steps.map((s, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Save & Export buttons */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={handleSave}
                >
                  <Save className="mr-2 h-4 w-4" />Save Option
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    let mapScreenshot: string | undefined;
                    if (onCaptureMapScreenshot) {
                      const screenshot = await onCaptureMapScreenshot();
                      if (screenshot) mapScreenshot = screenshot;
                    }
                    generateAssessmentPdf({
                      siteName: `Connection from ${sourceName}`,
                      proposedKw: Number(proposedKw) || 0,
                      lat: endpoints.destination.lngLat[1],
                      lng: endpoints.destination.lngLat[0],
                      score: result.score,
                      reasons: result.reasons,
                      nextSteps: result.next_steps,
                      distances,
                      constraints: result.constraints,
                      mapScreenshot,
                      electricalResult: electricalResult,
                      snapshotId: lastSnapshotId,
                      unitRates,
                      voltageOverride,
                      nearestHeadroomKw: sourceHeadroomKw,
                      streetViewCaptures,
                      designElements: designElements,
                      sections: {
                        streetView: (streetViewCaptures?.length ?? 0) > 0,
                        designElements: (designElements?.length ?? 0) > 0,
                      },
                    });
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />PDF
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title="Export JSON"
                  onClick={() => {
                    const kw = Number(proposedKw) || 0;
                    const costEst = kw > 0
                      ? estimateConnectionCost({ proposed_kw: kw, distances, constraints: result.constraints, nearest_headroom_kw: sourceHeadroomKw, voltage_override: voltageOverride })
                      : null;
                    exportAssessmentJson({
                      siteName: `Connection from ${sourceName}`,
                      proposedKw: kw,
                      lat: endpoints.destination.lngLat[1],
                      lng: endpoints.destination.lngLat[0],
                      score: result.score,
                      reasons: result.reasons,
                      nextSteps: result.next_steps,
                      distances,
                      constraints: result.constraints,
                      electricalResult,
                      snapshotId: lastSnapshotId,
                      costEstimate: costEst,
                      routeCoords: endpoints.routeCoords,
                    });
                  }}
                >
                  <FileJson className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* Saved assessments drawer */}
          <SavedAssessmentsDrawer
            assessments={savedAssessments}
            onDelete={handleDelete}
            onCompare={handleCompare}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
