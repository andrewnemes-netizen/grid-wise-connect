/**
 * Gridwise Connect — Unified "Run Gridwise" Panel
 * 
 * Single panel that collects site inputs and runs the full
 * 6-engine pipeline with progress indicators and structured results.
 */
import { useState, useCallback, useEffect } from "react";
import {
  X, Zap, Loader2, MapPin, CheckCircle, AlertTriangle, XCircle,
  ShieldAlert, Wrench, ChevronDown, ChevronUp, Cable, PoundSterling,
  Truck, Activity, Shield, FileText, Download, Save, BatteryCharging,
  Gauge, Construction, Eye, PencilRuler,
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUnitRates } from "@/hooks/useUnitRates";
import { supabase } from "@/integrations/supabase/client";
import { runGridwiseProject } from "@/lib/gridwise";
import { filterPackForAudience } from "@/lib/gridwise/commercialEngine";
import type { GridwiseProject, PipelineProgress, SiteInput, PackAudience } from "@/lib/gridwise/types";
import type { FeasibilityState, DnoKey } from "@/lib/evHub/types";
import type { DesignCable } from "@/hooks/useDesignMode";
import { designCablesToCandidates } from "@/lib/designCablesToCandidates";
import { convertConnectToDesign } from "@/lib/connectToDesign";

interface Props {
  lng: number;
  lat: number;
  onClose: () => void;
  /** Pre-drawn route from Connect tool */
  routeGeojson?: GeoJSON.LineString;
  /** Pre-drawn boundary */
  boundaryGeojson?: GeoJSON.Polygon;
  /** Map screenshot callback */
  onCaptureScreenshot?: () => Promise<string | null>;
  /** Design Mode cables to feed into engine */
  designCables?: DesignCable[];
  /** Callback to switch to Design Mode after conversion */
  onConvertToDesign?: (studyId: string) => void;
  /** Active study ID (for creating design elements) */
  activeStudyId?: string | null;
}

const DNO_OPTIONS: { value: DnoKey | "auto"; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "UKPN", label: "UKPN" },
  { value: "NPG", label: "NPG" },
  { value: "ENWL", label: "ENWL" },
  { value: "NGED", label: "NGED" },
  { value: "SPEN", label: "SPEN" },
  { value: "SSEN", label: "SSEN" },
];

const FEASIBILITY_CONFIG: Record<FeasibilityState, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  LV_OK: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "LV Connection Feasible" },
  DNO_STUDY_REQUIRED: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "DNO Study Required" },
  ENGINEERING_REVIEW_REQUIRED: { icon: ShieldAlert, color: "text-orange-600", bg: "bg-orange-50 border-orange-200", label: "Engineering Review Required" },
  LV_REINFORCEMENT_REQUIRED: { icon: Wrench, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "LV Reinforcement Required" },
  HV_CONNECTION_REQUIRED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "HV Connection Required" },
};

const BAND_CONFIG: Record<string, { color: string; bg: string }> = {
  GREEN: { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  AMBER: { color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  RED: { color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

function SectionHeader({ icon: Icon, title, badge }: { icon: any; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      </div>
      {badge && <Badge variant="outline" className="text-[10px]">{badge}</Badge>}
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
        <span className="font-medium text-xs">{value ?? "—"}</span>
      )}
    </div>
  );
}

export function GridwisePanel({ lng, lat, onClose, routeGeojson, boundaryGeojson, onCaptureScreenshot, designCables, onConvertToDesign, activeStudyId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: unitRates } = useUnitRates();

  // Inputs
  const [siteName, setSiteName] = useState("");
  const [postcode, setPostcode] = useState("");
  const [chargerCount, setChargerCount] = useState("4");
  const [chargerKw, setChargerKw] = useState("50");
  const [diversityFactor, setDiversityFactor] = useState("0.8");
  const [extraneous, setExtraneous] = useState(false);
  const [dnoOverride, setDnoOverride] = useState<DnoKey | "auto">("auto");
  const [voltageOverride, setVoltageOverride] = useState<"Auto" | "LV" | "HV" | "EHV">("Auto");

  // DNO auto-detection state
  const [detectedDno, setDetectedDno] = useState<string | null>(null);
  const [dnoDetecting, setDnoDetecting] = useState(false);

  // Auto-detect DNO from licence area boundaries on mount
  useEffect(() => {
    let cancelled = false;
    setDnoDetecting(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("lookup_dno_by_location", { p_lat: lat, p_lng: lng });
        if (cancelled) return;
        if (!error && data) {
          setDetectedDno(data);
        } else {
          setDetectedDno(null);
        }
      } catch {
        if (!cancelled) setDetectedDno(null);
      } finally {
        if (!cancelled) setDnoDetecting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lat, lng]);

  // Pipeline state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [project, setProject] = useState<GridwiseProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [converting, setConverting] = useState(false);

  // Collapsible sections
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [electricalOpen, setElectricalOpen] = useState(false);
  const [commercialOpen, setCommercialOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [packAudience, setPackAudience] = useState<PackAudience>("client");

  const proposedKw = Number(chargerCount) * Number(chargerKw) * Number(diversityFactor);

  // Resolve the DNO to use: manual override or auto-detected
  const resolvedDnoLookup = dnoOverride !== "auto" ? dnoOverride : detectedDno ?? undefined;

  const handleRun = useCallback(async () => {
    if (!resolvedDnoLookup) {
      toast({ title: "DNO not detected", description: "No DNO licence area found for this location. Please select a DNO manually.", variant: "destructive" });
      return;
    }

    setRunning(true);
    setProject(null);
    setSaved(false);

    try {
      const input: SiteInput = {
        site_name: siteName || "Unnamed Site",
        postcode: postcode || undefined,
        lat,
        lng,
        proposed_kw: proposedKw,
        charger_count: Number(chargerCount),
        charger_kw_each: Number(chargerKw),
        diversity_factor: Number(diversityFactor),
        extraneous_within_2p5m: extraneous,
        route_geojson: routeGeojson,
        boundary_geojson: boundaryGeojson,
        voltage_override: voltageOverride === "Auto" ? undefined : voltageOverride,
        dno_override: dnoOverride === "auto" ? undefined : dnoOverride,
        client_org: undefined,
      };

      // Capture screenshot if available
      let mapScreenshot: string | undefined;
      if (onCaptureScreenshot) {
        try {
          mapScreenshot = (await onCaptureScreenshot()) ?? undefined;
        } catch {}
      }

      // Convert design cables to engine candidates
      const cableCandidates = designCables && designCables.length > 0
        ? designCablesToCandidates(designCables, lat, lng)
        : undefined;

      const result = await runGridwiseProject(input, {
        unitRates: unitRates ?? undefined,
        onProgress: setProgress,
        visuals: { map_screenshot: mapScreenshot },
        dnoLookupResult: resolvedDnoLookup,
        cableCandidates,
      });

      setProject(result);
      toast({ title: "Gridwise analysis complete", description: `Run ID: ${result.run_id}` });
    } catch (err: any) {
      toast({ title: "Pipeline failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }, [siteName, postcode, lat, lng, proposedKw, chargerCount, chargerKw, diversityFactor, extraneous, routeGeojson, boundaryGeojson, voltageOverride, dnoOverride, unitRates, onCaptureScreenshot, toast, resolvedDnoLookup]);

  const handleSave = useCallback(async () => {
    if (!project || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("sites").insert({
        site_name: project.site.site_name,
        postcode: project.site.postcode ?? null,
        proposed_kw: project.site.proposed_kw,
        score: project.feasibility.viability_band,
        score_reasons: project.audit.reason_codes,
        connection_options: project.assets.distances,
        created_by: user.id,
        viability_index: project.feasibility.viability_index,
        grid_readiness: project.feasibility.grid_readiness,
        deployment_class: project.feasibility.deployment_class,
        cost_band: project.commercial.cost_range.mid < 50000 ? "£" : project.commercial.cost_range.mid < 150000 ? "££" : "£££",
        reinforcement_probability: project.feasibility.reinforcement_probability,
        raw_score_data: project as any,
      } as any);
      if (error) throw error;
      toast({ title: "Site saved to portfolio" });
      setSaved(true);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [project, user, toast]);

  const handleConvertToDesign = useCallback(async () => {
    if (!project || !user || !activeStudyId) {
      toast({ title: "No active study", description: "Create or open a study first to convert to Design Mode.", variant: "destructive" });
      return;
    }
    setConverting(true);
    try {
      const result = await convertConnectToDesign(project, activeStudyId, user.id);
      if (result.warnings.length > 0) {
        toast({ title: "Conversion completed with warnings", description: result.warnings[0] });
      } else {
        toast({ title: "Converted to Design Mode", description: `${result.cablesCreated} cable(s) + ${result.elementsCreated} equipment placed.` });
      }
      onConvertToDesign?.(activeStudyId);
    } catch (err: any) {
      toast({ title: "Conversion failed", description: err.message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  }, [project, user, activeStudyId, toast, onConvertToDesign]);

  const progressPct = progress
    ? progress.stage === "COMPLETE" ? 100
    : progress.stage === "ERROR" ? 0
    : Math.round(((progress.stage_index + 1) / progress.total_stages) * 100)
    : 0;

  const filteredPack = project ? filterPackForAudience(project.commercial, packAudience) : null;

  const fState = project ? FEASIBILITY_CONFIG[project.feasibility.feasibility_state] : null;
  const bandCfg = project ? BAND_CONFIG[project.feasibility.viability_band] || BAND_CONFIG.AMBER : null;

  return (
    <div className="absolute top-0 right-0 z-20 h-full w-[440px] border-l bg-background shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Gridwise Connect</span>
          {project && (
            <Badge variant="outline" className="text-[9px] font-mono">{project.run_id}</Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Location */}
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Location
            </p>
            <p className="text-sm font-mono">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {dnoDetecting ? (
                <Badge variant="outline" className="text-[9px]"><Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />Detecting DNO...</Badge>
              ) : detectedDno ? (
                <Badge variant="default" className="text-[9px]">DNO: {detectedDno} ✓</Badge>
              ) : (
                <Badge variant="destructive" className="text-[9px]">DNO not detected — select manually</Badge>
              )}
              {routeGeojson && (
                <Badge variant="secondary" className="text-[9px]">Route drawn ✓</Badge>
              )}
              {boundaryGeojson && (
                <Badge variant="secondary" className="text-[9px]">Boundary set ✓</Badge>
              )}
              {designCables && designCables.length > 0 && (
                <Badge variant="secondary" className="text-[9px]">
                  <Cable className="h-2.5 w-2.5 mr-0.5" />
                  {designCables.length} design cable{designCables.length !== 1 ? "s" : ""} ✓
                </Badge>
              )}
            </div>
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Site Name</Label>
                <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. North Depot" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Postcode</Label>
                <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. NE1 4LP" className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Chargers</Label>
                <Input type="number" value={chargerCount} onChange={(e) => setChargerCount(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">kW each</Label>
                <Input type="number" value={chargerKw} onChange={(e) => setChargerKw(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Diversity</Label>
                <Input type="number" step="0.1" value={diversityFactor} onChange={(e) => setDiversityFactor(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            <div className="rounded-md border bg-muted/10 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Demand</span>
                <span className="text-sm font-bold text-primary">{Math.round(proposedKw)} kW</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">DNO</Label>
                <Select value={dnoOverride} onValueChange={(v) => setDnoOverride(v as any)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DNO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Voltage</Label>
                <Select value={voltageOverride} onValueChange={(v) => setVoltageOverride(v as any)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Auto">Auto</SelectItem>
                    <SelectItem value="LV">LV</SelectItem>
                    <SelectItem value="HV">HV</SelectItem>
                    <SelectItem value="EHV">EHV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/10 p-2.5">
              <Label className="text-xs">Extraneous conductive parts nearby</Label>
              <Switch checked={extraneous} onCheckedChange={setExtraneous} />
            </div>
          </div>

          {/* Run Button */}
          <Button onClick={handleRun} disabled={running} className="w-full" size="lg">
            {running ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{progress?.message || "Running..."}</>
            ) : (
              <><Zap className="mr-2 h-4 w-4" />Run Gridwise</>
            )}
          </Button>

          {/* Progress bar */}
          {running && progress && (
            <div className="space-y-1">
              <Progress value={progressPct} className="h-2" />
              <p className="text-[10px] text-muted-foreground text-center">{progress.message}</p>
            </div>
          )}

          {/* ====================== RESULTS ====================== */}
          {project && fState && bandCfg && (
            <>
              {/* ── Feasibility Verdict ── */}
              <div className={`rounded-lg border p-4 ${fState.bg}`}>
                <div className="flex items-center gap-3">
                  <fState.icon className={`h-7 w-7 ${fState.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${fState.color}`}>{fState.label}</span>
                      <span className={`text-2xl font-black ${bandCfg.color}`}>{project.feasibility.viability_index}</span>
                    </div>
                    <p className={`text-[10px] ${bandCfg.color} opacity-70`}>Viability Index (0–100)</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground">Grid Readiness</p>
                    <Badge variant="outline" className="text-[10px]">{project.feasibility.grid_readiness}</Badge>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground">Deploy Class</p>
                    <Badge variant="outline" className="text-[10px]">{project.feasibility.deployment_class}</Badge>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground">Reinforce %</p>
                    <Badge variant="outline" className="text-[10px]">{project.feasibility.reinforcement_probability}%</Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* ── Engine 1: Asset Discovery ── */}
              <Collapsible open={assetsOpen} onOpenChange={setAssetsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
                    <span className="flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-primary" />
                      Asset Discovery
                    </span>
                    {assetsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1">
                  <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                    {project.assets.nearest_substation && (
                      <>
                        <MetricRow label="Nearest Substation" value={project.assets.nearest_substation.name ?? "—"} />
                        <MetricRow label="Distance" value={`${Math.round(project.assets.nearest_substation.distance_m)}m`} />
                        {project.assets.nearest_substation.headroom_kw != null && (
                          <MetricRow label="Headroom" value={`${project.assets.nearest_substation.headroom_kw.toLocaleString()} kW`} />
                        )}
                        {project.assets.nearest_substation.utilisation_pct != null && (
                          <MetricRow label="Utilisation" value={`${project.assets.nearest_substation.utilisation_pct}%`} />
                        )}
                      </>
                    )}
                    <MetricRow label="Capacity Flag" badge={project.assets.constraints.capacity_flag} badgeVariant="outline" />
                    {project.assets.constraints.ndp_intersect && (
                      <MetricRow label="NDP Conflict" badge="Yes" badgeVariant="destructive" />
                    )}
                    {project.assets.constraints.wayleave_intersect && (
                      <MetricRow label="Wayleave" badge="Required" badgeVariant="destructive" />
                    )}
                  </div>
                  {project.assets.alternatives.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground font-medium">Alternatives ({project.assets.alternatives.length})</p>
                      {project.assets.alternatives.slice(0, 3).map((alt, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px] rounded border bg-muted/5 px-2 py-1">
                          <span className="truncate max-w-[60%]">{alt.name ?? alt.asset_id}</span>
                          <span className="text-muted-foreground">{Math.round(alt.distance_m)}m</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* ── Engine 3: Route & Streetworks ── */}
              <Collapsible open={routeOpen} onOpenChange={setRouteOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
                    <span className="flex items-center gap-2">
                      <Truck className="h-3.5 w-3.5 text-primary" />
                      Route & Streetworks
                      {project.route.streetworks.risk_flags.length > 0 && (
                        <Badge variant="destructive" className="text-[9px] h-4 px-1">{project.route.streetworks.risk_flags.length}</Badge>
                      )}
                    </span>
                    {routeOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1">
                  <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                    <MetricRow label="Total Route" value={`${project.route.route_quantities.total_length_m}m`} />
                    <MetricRow label="Route Source" badge={project.route.route_source === "user_drawn" ? "Drawn" : "Estimated"} badgeVariant={project.route.route_source === "user_drawn" ? "default" : "secondary"} />
                    <MetricRow
                      label="Footway Compliant"
                      badge={project.route.streetworks.footway_compliant === null ? "Unknown" : project.route.streetworks.footway_compliant ? "Yes" : "No"}
                      badgeVariant={project.route.streetworks.footway_compliant === false ? "destructive" : "outline"}
                    />
                    <MetricRow
                      label="Traffic Control"
                      badge={project.route.streetworks.traffic_control_required ? "Required" : "Not required"}
                      badgeVariant={project.route.streetworks.traffic_control_required ? "secondary" : "outline"}
                    />
                    <MetricRow
                      label="Permit Escalation"
                      badge={project.route.streetworks.permit_escalation_required ? "Likely" : "No"}
                      badgeVariant={project.route.streetworks.permit_escalation_required ? "destructive" : "outline"}
                    />
                  </div>
                  {project.route.streetworks.warnings.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground font-medium">Warnings</p>
                      {project.route.streetworks.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* ── Engine 4: Electrical & Safety ── */}
              <Collapsible open={electricalOpen} onOpenChange={setElectricalOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
                    <span className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      Electrical & Safety
                    </span>
                    {electricalOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1">
                  <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                    <MetricRow label="Service Cable" value={project.electrical.sizing.service_cable} />
                    <MetricRow label="LV Main Cable" value={project.electrical.sizing.lv_main_cable} />
                    <MetricRow label="Reinforcement Trigger" badge={project.electrical.sizing.reinforcement_trigger ? "Yes" : "No"} badgeVariant={project.electrical.sizing.reinforcement_trigger ? "secondary" : "outline"} />
                    <MetricRow
                      label="Earthing"
                      badge={project.electrical.earthing.review_required ? "Review Required" : "OK"}
                      badgeVariant={project.electrical.earthing.review_required ? "destructive" : "outline"}
                    />
                    <MetricRow
                      label="Reinforcement"
                      badge={project.electrical.reinforcement.state !== "NO_REINFORCEMENT" ? project.electrical.reinforcement.state.replace(/_/g, " ") : "None"}
                      badgeVariant={project.electrical.reinforcement.state !== "NO_REINFORCEMENT" ? "destructive" : "outline"}
                    />
                    {project.electrical.validation && (
                      <>
                        <Separator className="my-1" />
                        <MetricRow label="Voltage Drop" value={`${project.electrical.validation.voltage_drop.total_vd_pct.toFixed(1)}%`} />
                        <MetricRow
                          label="Voltage Drop Status"
                          badge={project.electrical.validation.voltage_drop.pass ? "PASS" : "FAIL"}
                          badgeVariant={project.electrical.validation.voltage_drop.pass ? "outline" : "destructive"}
                        />
                        <MetricRow
                          label="Overall"
                          badge={project.electrical.validation.overall_pass ? "PASS" : "FAIL"}
                          badgeVariant={project.electrical.validation.overall_pass ? "outline" : "destructive"}
                        />
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* ── Engine 5: Commercial ── */}
              <Collapsible open={commercialOpen} onOpenChange={setCommercialOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
                    <span className="flex items-center gap-2">
                      <PoundSterling className="h-3.5 w-3.5 text-primary" />
                      Commercial
                    </span>
                    {commercialOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1">
                  {/* Cost range hero */}
                  <div className="rounded-md border bg-primary/5 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Estimated Cost Range</p>
                    <div className="flex items-baseline justify-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">£{project.commercial.cost_range.low.toLocaleString()}</span>
                      <span className="text-lg font-bold text-primary">£{project.commercial.cost_range.mid.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">£{project.commercial.cost_range.high.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Audience filter */}
                  <div className="flex gap-1">
                    {(["client", "installer", "dno"] as PackAudience[]).map((aud) => (
                      <Button
                        key={aud}
                        variant={packAudience === aud ? "default" : "outline"}
                        size="sm"
                        className="flex-1 text-[10px] h-7 capitalize"
                        onClick={() => setPackAudience(aud)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {aud}
                      </Button>
                    ))}
                  </div>

                  {filteredPack && (
                    <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium capitalize">{packAudience} View</p>
                      {filteredPack.show_pricing && filteredPack.total_shown != null && (
                        <MetricRow label="Total" value={`£${filteredPack.total_shown.toLocaleString()}`} />
                      )}
                      {!filteredPack.show_pricing && (
                        <p className="text-[10px] text-muted-foreground italic">No pricing shown for this audience</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">{filteredPack.visible_items.length} line items</p>
                    </div>
                  )}

                  {/* Engineering BOQ summary */}
                  <div className="rounded-md border bg-muted/10 p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium">Engineering BOQ</p>
                    <MetricRow label="Electrical Items" value={`${project.commercial.engineering_boq.electrical.length}`} />
                    <MetricRow label="Civils Items" value={`${project.commercial.engineering_boq.civils.length}`} />
                    <MetricRow label="TM Items" value={`${project.commercial.engineering_boq.traffic_mgmt.length}`} />
                    <MetricRow label="Fees" value={`${project.commercial.engineering_boq.fees.length}`} />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* ── Audit Trail ── */}
              <Collapsible open={auditOpen} onOpenChange={setAuditOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
                    <span className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      Audit Trail
                      <Badge variant="outline" className="text-[9px]">{project.audit.reason_codes.length + project.audit.warnings.length}</Badge>
                    </span>
                    {auditOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1">
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {project.audit.reason_codes.map((code, i) => (
                      <div key={`r-${i}`} className="flex items-start gap-1.5 text-[10px] rounded border bg-muted/5 px-2 py-1">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 bg-primary" />
                        <span className="text-muted-foreground">{code}</span>
                      </div>
                    ))}
                    {project.audit.warnings.map((warning, i) => (
                      <div key={`w-${i}`} className="flex items-start gap-1.5 text-[10px] rounded border bg-amber-50 border-amber-200 px-2 py-1">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 bg-amber-500" />
                        <span className="text-amber-700">{warning}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              {/* ── Actions ── */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const json = JSON.stringify(project, null, 2);
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `gridwise-${project.run_id}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />Export JSON
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

              {/* Convert to Design Mode */}
              {onConvertToDesign && activeStudyId && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleConvertToDesign}
                  disabled={converting}
                >
                  {converting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Converting…</>
                  ) : (
                    <><PencilRuler className="mr-2 h-4 w-4" />Convert to Design Mode</>
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}