import { useState, useMemo } from "react";
import {
  X, MapPin, Zap, AlertTriangle, CheckCircle, XCircle, Save, Loader2,
  Search, ClipboardCheck, FolderOpen, Download, Activity, Gauge, TrendingUp,
  PoundSterling, ChevronDown, ChevronUp, Shield, Truck, Cable, FileText, BatteryCharging,
  TrafficCone, Bus, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CostEstimatePanel } from "./CostEstimatePanel";
import { generateAssessmentPdf } from "@/lib/generateAssessmentPdf";
import {
  buildRawMetrics, calculateViabilityIndex, getViabilityBand,
  getDeploymentClass, getGridReadiness, getDeploymentFriction,
  getRecommendedScale, getRecommendedVoltage, getReinforcementProbability,
  getCostBand, getFeederConstraintRisk, type RawMetrics,
} from "@/lib/scoringEngine";
import { estimateConnectionCost } from "@/lib/connectionCosts";
import { useUnitRates } from "@/hooks/useUnitRates";

export interface ConnectionLine {
  id: string;
  label: string;
  coords: [number, number][];
  color: string;
  distance_m: number;
}

interface Props {
  lng: number | null;
  lat: number | null;
  onClose: () => void;
  onSaved?: () => void;
  onConnectionLines?: (lines: ConnectionLine[]) => void;
}

interface ScoreResult {
  score: string;
  reasons: string[];
  next_steps: string[];
  data_timestamp: string;
  distances?: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  distance_bands?: { primary: string; feeder: string; capacity_segment: string };
  constraints?: {
    ndp_intersect: boolean;
    ndp_within_1000m: boolean;
    wayleave_intersect: boolean;
    capacity_flag: string;
    min_footway_m: number | null;
    min_carriageway_m: number | null;
  };
  capacity_indicator?: string;
  nearest_points?: { primary?: [number, number]; feeder?: [number, number]; cable?: [number, number] };
  nearest_substations?: Array<{
    site_name: string;
    site_id: string;
    utilisation_pct: number | null;
    firm_capacity_kw: number | null;
    max_demand_kw: number | null;
    transformer_headroom_kw: number | null;
    headroom_band: string | null;
    utilisation_band: string | null;
    distance_m?: number;
  }>;
}

interface SafetyResult {
  risk_score: number;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
  recommendation: string;
  accident_summary: { total: number; fatal: number; serious: number; slight: number; radius_m: number };
  traffic_summary: { count_points_nearby: number; max_aadf: number };
  transport_summary: { bus_stops: number; rail_stations: number; total_nodes: number };
  sub_scores: { accident_risk: number; traffic_risk: number; pedestrian_exposure: number };
  ai_narrative?: string | null;
}

const SITE_TYPES = [
  { value: "depot", label: "Depot" },
  { value: "workplace", label: "Workplace" },
  { value: "public", label: "Public" },
  { value: "fleet", label: "Fleet" },
  { value: "other", label: "Other" },
];

const VERDICT_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  GREEN: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Deployable Now" },
  AMBER: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Viable with Works" },
  RED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Reinforcement Likely" },
};

const GRID_READINESS_CONFIG: Record<string, { color: string; bg: string }> = {
  Strong: { color: "text-emerald-700", bg: "bg-emerald-100" },
  Moderate: { color: "text-amber-700", bg: "bg-amber-100" },
  Constrained: { color: "text-red-700", bg: "bg-red-100" },
};

const FRICTION_CONFIG: Record<string, { color: string; bg: string }> = {
  Low: { color: "text-emerald-700", bg: "bg-emerald-100" },
  Medium: { color: "text-amber-700", bg: "bg-amber-100" },
  High: { color: "text-red-700", bg: "bg-red-100" },
};

function SectionHeader({ icon: Icon, title, children }: { icon: any; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  );
}

function MetricRow({ label, value, badge, badgeVariant }: { label: string; value?: string; badge?: string; badgeVariant?: "default" | "secondary" | "destructive" | "outline" }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {badge ? (
        <Badge variant={badgeVariant || "outline"} className="text-[10px]">{badge}</Badge>
      ) : (
        <span className="font-medium text-xs">{value}</span>
      )}
    </div>
  );
}

export function UnifiedIntelligencePanel({ lng, lat, onClose, onSaved, onConnectionLines }: Props) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const { data: unitRates } = useUnitRates();
  const isInternal = hasRole("admin") || hasRole("engineer");

  const [siteName, setSiteName] = useState("");
  const [postcode, setPostcode] = useState("");
  const [proposedKw, setProposedKw] = useState("");
  const [siteType, setSiteType] = useState("other");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [safetyResult, setSafetyResult] = useState<SafetyResult | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);

  const pkw = Number(proposedKw) || 0;

  const rawMetrics = useMemo<RawMetrics | null>(() => {
    if (!result) return null;
    return buildRawMetrics(result, pkw);
  }, [result, pkw]);

  const viabilityIndex = rawMetrics ? calculateViabilityIndex(rawMetrics) : 0;
  const band = rawMetrics ? getViabilityBand(viabilityIndex) : "AMBER";
  const verdict = VERDICT_CONFIG[band];

  const deployClass = rawMetrics ? getDeploymentClass(rawMetrics) : null;
  const gridReady = rawMetrics ? getGridReadiness(rawMetrics) : null;
  const friction = rawMetrics ? getDeploymentFriction(rawMetrics) : null;
  const reinforceProb = rawMetrics ? getReinforcementProbability(rawMetrics) : 0;
  const feederRisk = rawMetrics ? getFeederConstraintRisk(rawMetrics) : "Medium";

  const costEstimate = useMemo(() => {
    if (!result?.distances || pkw <= 0) return null;
    const nearestSub = result.nearest_substations?.[0];
    return estimateConnectionCost({
      proposed_kw: pkw,
      distances: result.distances,
      constraints: result.constraints,
      nearest_headroom_kw: nearestSub?.transformer_headroom_kw ?? undefined,
    }, unitRates);
  }, [result, pkw, unitRates]);

  const costBand = costEstimate ? getCostBand(costEstimate.total_estimate) : null;

  // Derived scores from safety engine
  const trafficScore = useMemo(() => {
    if (!safetyResult) return null;
    const aadf = safetyResult.traffic_summary.max_aadf;
    if (aadf > 10000) return { label: "HIGH", score: 90, color: "text-emerald-700", bg: "bg-emerald-100" };
    if (aadf > 3000) return { label: "MEDIUM", score: 60, color: "text-amber-700", bg: "bg-amber-100" };
    return { label: "LOW", score: 25, color: "text-red-700", bg: "bg-red-100" };
  }, [safetyResult]);

  const accessibilityScore = useMemo(() => {
    if (!safetyResult) return null;
    const { bus_stops, rail_stations, total_nodes } = safetyResult.transport_summary;
    const boosted = total_nodes + (rail_stations * 3); // rail boost
    if (boosted > 5) return { label: "HIGH", score: 90, color: "text-emerald-700", bg: "bg-emerald-100" };
    if (boosted >= 2) return { label: "MEDIUM", score: 55, color: "text-amber-700", bg: "bg-amber-100" };
    return { label: "LOW", score: 20, color: "text-red-700", bg: "bg-red-100" };
  }, [safetyResult]);

  const safetyScore = useMemo(() => {
    if (!safetyResult) return null;
    const risk = safetyResult.risk_score;
    const safety = 100 - risk; // invert: high risk = low safety
    const level = safety >= 60 ? "LOW RISK" : safety >= 30 ? "MODERATE" : "HIGH RISK";
    const color = safety >= 60 ? "text-emerald-700" : safety >= 30 ? "text-amber-700" : "text-red-700";
    const bg = safety >= 60 ? "bg-emerald-100" : safety >= 30 ? "bg-amber-100" : "bg-red-100";
    return { label: level, score: safety, color, bg };
  }, [safetyResult]);

  // Master combined score
  const masterScore = useMemo(() => {
    if (!rawMetrics || !safetyResult) return null;
    const tScore = trafficScore?.score ?? 50;
    const aScore = accessibilityScore?.score ?? 50;
    const sScore = safetyScore?.score ?? 50;
    const gScore = viabilityIndex; // 0-100
    // (Traffic × 0.35) + (Accessibility × 0.25) + (Grid × 0.25) - (Safety Risk × 0.10) - (Civils × 0.05)
    const combined = Math.round(
      tScore * 0.35 + aScore * 0.25 + gScore * 0.25 - (100 - sScore) * 0.10 - (rawMetrics.civils.constraint_count * 5) * 0.05
    );
    const clamped = Math.max(0, Math.min(100, combined));
    const verdict = clamped >= 65 ? "INSTALL" : clamped >= 40 ? "REVIEW" : "AVOID";
    return { score: clamped, verdict };
  }, [rawMetrics, safetyResult, trafficScore, accessibilityScore, safetyScore, viabilityIndex]);

  const MASTER_VERDICT_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
    INSTALL: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Recommended for Installation" },
    REVIEW: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Requires Further Review" },
    AVOID: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Not Recommended" },
  };

  const handleScore = async () => {
    if (!lng || !lat) return;
    setLoading(true);
    try {
      // Fire both calls in parallel
      const [scoreRes, safetyRes] = await Promise.all([
        supabase.functions.invoke("score-site", {
          body: { lng, lat, proposed_kw: pkw, site_name: siteName, postcode, site_type: siteType },
        }),
        supabase.functions.invoke("safety-engine", {
          body: { lng, lat, radius_m: 500, site_name: siteName || "Site" },
        }),
      ]);

      if (scoreRes.error) throw scoreRes.error;
      setResult(scoreRes.data);

      if (!safetyRes.error && safetyRes.data) {
        setSafetyResult(safetyRes.data);
      }

      if (scoreRes.data.nearest_points && onConnectionLines) {
        const lines: ConnectionLine[] = [];
        const origin: [number, number] = [lng, lat];
        if (res.data.nearest_points.primary)
          lines.push({ id: "line-primary", label: "Primary Substation", coords: [origin, res.data.nearest_points.primary], color: "#e74c3c", distance_m: res.data.distances?.primary_m || 0 });
        if (res.data.nearest_points.feeder)
          lines.push({ id: "line-feeder", label: "Feeder", coords: [origin, res.data.nearest_points.feeder], color: "#9b59b6", distance_m: res.data.distances?.feeder_m || 0 });
        if (res.data.nearest_points.cable)
          lines.push({ id: "line-cable", label: "Cable", coords: [origin, res.data.nearest_points.cable], color: "#e67e22", distance_m: res.data.distances?.capacity_segment_m || 0 });
        onConnectionLines(lines);
      }
    } catch (err: any) {
      toast({ title: "Assessment failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!lng || !lat || !result || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("sites").insert({
        site_name: siteName || "Unnamed Site",
        postcode,
        proposed_kw: pkw || null,
        site_type: siteType,
        score: band,
        score_reasons: result.reasons,
        connection_options: result.distances || result.distance_bands || [],
        next_steps: result.next_steps,
        created_by: user.id,
        viability_index: viabilityIndex,
        grid_readiness: gridReady,
        deployment_class: deployClass,
        cost_band: costBand,
        reinforcement_probability: reinforceProb,
        raw_score_data: result,
      } as any);
      if (error) throw error;
      toast({ title: "Site saved to portfolio" });
      setSaved(true);
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const bestPOC = result?.nearest_substations?.[0];

  return (
    <div className="absolute top-0 right-0 z-20 h-full w-[420px] border-l bg-background shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Site Intelligence</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Location */}
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Location</p>
            <p className="text-sm font-mono">{lat?.toFixed(5)}, {lng?.toFixed(5)}</p>
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Site Name</Label>
              <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. North Depot" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Postcode</Label>
              <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. NE1 4LP" className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Proposed kW</Label>
                <Input type="number" value={proposedKw} onChange={(e) => setProposedKw(e.target.value)} placeholder="e.g. 250" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Site Type</Label>
                <Select value={siteType} onValueChange={setSiteType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SITE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button onClick={handleScore} disabled={loading || !lng || !lat} className="w-full">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analysing Site…</> : <><Zap className="mr-2 h-4 w-4" />Analyse Site</>}
          </Button>

          {/* ====================== RESULTS ====================== */}
          {result && rawMetrics && (
            <>
              {/* ── Section 1: Overall Verdict ── */}
              <div className={`rounded-lg border p-4 ${verdict.bg}`}>
                <div className="flex items-center gap-3">
                  <verdict.icon className={`h-7 w-7 ${verdict.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-lg font-bold ${verdict.color}`}>{band}</span>
                      <span className={`text-2xl font-black ${verdict.color}`}>{viabilityIndex}</span>
                    </div>
                    <p className={`text-xs ${verdict.color}`}>{verdict.label}</p>
                    <p className={`text-[10px] ${verdict.color} opacity-70`}>Viability Index (0–100)</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* ── Section 2: EV Deployment ── */}
              <div className="space-y-2">
                <SectionHeader icon={BatteryCharging} title="EV Deployment" />
                <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                  <MetricRow label="Recommended Scale" value={getRecommendedScale(pkw)} />
                  <MetricRow
                    label="Grid Readiness"
                    badge={gridReady || "—"}
                    badgeVariant="outline"
                  />
                  <MetricRow
                    label="Deployment Friction"
                    badge={friction || "—"}
                    badgeVariant="outline"
                  />
                  <MetricRow
                    label="Deployment Class"
                    badge={deployClass || "—"}
                    badgeVariant={deployClass === "Fast Deploy" ? "default" : deployClass === "Needs Reinforcement" ? "destructive" : "secondary"}
                  />
                </div>
              </div>

              <Separator />

              {/* ── Section 3: ICP Connection Strategy ── */}
              <div className="space-y-2">
                <SectionHeader icon={Cable} title="ICP Connection Strategy" />
                <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                  {bestPOC && (
                    <MetricRow label="Best POC" value={bestPOC.site_name || bestPOC.site_id} />
                  )}
                  <MetricRow label="Recommended Voltage" badge={getRecommendedVoltage(pkw)} badgeVariant="outline" />
                  <MetricRow label="Feeder Constraint Risk" badge={feederRisk} badgeVariant={feederRisk === "Low" ? "outline" : feederRisk === "Medium" ? "secondary" : "destructive"} />
                  <MetricRow label="Reinforcement Probability" value={`${reinforceProb}%`} />
                </div>
              </div>

              <Separator />

              {/* ── Section 4: Commercial Viability ── */}
              <div className="space-y-2">
                <SectionHeader icon={PoundSterling} title="Commercial Viability" />
                <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                  {costBand && (
                    <MetricRow label="Cost Band" badge={costBand} badgeVariant={costBand === "£" ? "default" : costBand === "££" ? "secondary" : "destructive"} />
                  )}
                  {result.distances && isInternal && (
                    <MetricRow label="Cable Length Est." value={`${Math.min(pkw <= 80 ? result.distances.capacity_segment_m : pkw <= 1500 ? result.distances.feeder_m : result.distances.primary_m, pkw <= 80 ? 500 : pkw <= 1500 ? 3000 : 5000).toLocaleString()}m`} />
                  )}
                  {rawMetrics.civils.constraint_count > 0 && (
                    <MetricRow label="Civils Complexity" badge={rawMetrics.civils.constraint_count > 1 ? "High" : "Medium"} badgeVariant={rawMetrics.civils.constraint_count > 1 ? "destructive" : "secondary"} />
                  )}
                  {rawMetrics.civils.constraint_count === 0 && (
                    <MetricRow label="Civils Complexity" badge="Low" badgeVariant="outline" />
                  )}
                </div>

                {/* Full cost estimate expandable */}
                {result.distances && pkw > 0 && (
                  <CostEstimatePanel
                    voltageOverride="Auto"
                    proposed_kw={pkw}
                    distances={result.distances}
                    constraints={result.constraints}
                    nearest_headroom_kw={bestPOC?.transformer_headroom_kw ?? undefined}
                  />
                )}
              </div>

              <Separator />

              {/* ── Section 5: Supporting Intelligence (collapsible) ── */}
              <Collapsible open={supportOpen} onOpenChange={setSupportOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full text-xs h-7">
                    {supportOpen ? <ChevronUp className="mr-1.5 h-3 w-3" /> : <ChevronDown className="mr-1.5 h-3 w-3" />}
                    Supporting Intelligence
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  {/* Nearest substations ranked */}
                  {result.nearest_substations && result.nearest_substations.length > 0 && (
                    <div className="space-y-2">
                      <SectionHeader icon={Activity} title="Nearest Substations" />
                      {result.nearest_substations.slice(0, 5).map((sub, i) => (
                        <div key={i} className="rounded-md border bg-muted/10 p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium truncate max-w-[60%]">{sub.site_name}</span>
                            <span className="text-[9px] text-muted-foreground">{sub.site_id}</span>
                          </div>
                          {sub.firm_capacity_kw && sub.max_demand_kw !== null && (
                            <div className="space-y-0.5">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-muted-foreground">Demand / Capacity</span>
                                <span className="font-medium">{sub.max_demand_kw?.toLocaleString()} / {sub.firm_capacity_kw.toLocaleString()} kW</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${(sub.utilisation_pct ?? 0) < 60 ? "bg-emerald-500" : (sub.utilisation_pct ?? 0) < 85 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${Math.min(sub.utilisation_pct ?? 0, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {sub.transformer_headroom_kw !== null && (
                            <div className="flex justify-between text-[10px]">
                              <span className="text-muted-foreground">Headroom</span>
                              <span className="font-medium">{sub.transformer_headroom_kw?.toLocaleString()} kW</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Connection distances */}
                  {isInternal && result.distances && (
                    <div className="space-y-1.5">
                      <SectionHeader icon={Cable} title="Connection Distances" />
                      {[
                        { label: "Primary Substation", val: result.distances.primary_m, color: "#e74c3c" },
                        { label: "Feeder", val: result.distances.feeder_m, color: "#9b59b6" },
                        { label: "Cable Segment", val: result.distances.capacity_segment_m, color: "#e67e22" },
                      ].map((d) => (
                        <div key={d.label} className="flex items-center justify-between text-sm rounded-md border bg-muted/20 px-3 py-1.5">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                            <span className="text-muted-foreground text-xs">{d.label}</span>
                          </span>
                          <span className="font-semibold text-xs">{d.val.toLocaleString()}m</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Constraints */}
                  {isInternal && result.constraints && (
                    <div className="space-y-1.5">
                      <SectionHeader icon={Shield} title="Constraints Detected" />
                      <div className="space-y-1 text-sm">
                        <MetricRow label="NDP Intersect" badge={result.constraints.ndp_intersect ? "Yes" : "No"} badgeVariant={result.constraints.ndp_intersect ? "destructive" : "outline"} />
                        <MetricRow label="NDP within 1km" badge={result.constraints.ndp_within_1000m ? "Yes" : "No"} badgeVariant={result.constraints.ndp_within_1000m ? "secondary" : "outline"} />
                        <MetricRow label="Wayleave" badge={result.constraints.wayleave_intersect ? "Yes" : "No"} badgeVariant={result.constraints.wayleave_intersect ? "destructive" : "outline"} />
                        <MetricRow label="Capacity" badge={result.constraints.capacity_flag} badgeVariant="outline" />
                      </div>
                    </div>
                  )}

                  {/* Assessment reasons */}
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
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* Export & Save */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => generateAssessmentPdf({
                    siteName: siteName || undefined,
                    postcode: postcode || undefined,
                    proposedKw: pkw,
                    lat: lat ?? undefined,
                    lng: lng ?? undefined,
                    score: band,
                    reasons: result.reasons,
                    nextSteps: result.next_steps,
                    distances: result.distances,
                    distanceBands: result.distance_bands,
                    constraints: result.constraints,
                    unitRates,
                  })}
                >
                  <Download className="mr-2 h-4 w-4" />Export PDF
                </Button>
                {!saved ? (
                  <Button onClick={handleSave} disabled={saving} className="flex-1">
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save</>}
                  </Button>
                ) : (
                  <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 p-2 flex items-center justify-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-xs text-emerald-700 font-medium">Saved</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
