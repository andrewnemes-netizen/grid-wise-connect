/**
 * Unified Assessment Panel — merges EV Hub, Connect, and Gridwise into one.
 * 
 * Two entry modes:
 *   A) Pin Drop — auto asset discovery + auto route → full pipeline
 *   B) Route Draw — user draws source→destination → route injected into pipeline
 * 
 * All assessments flow through runGridwiseProject() for consistent cost methodology.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  X, Zap, Loader2, MapPin, CheckCircle, AlertTriangle, XCircle,
  ShieldAlert, Wrench, ChevronDown, ChevronUp, Cable, PoundSterling,
  Truck, Activity, Shield, FileText, Download, Save, BatteryCharging,
  Gauge, Construction, Eye, Paintbrush, Radar, Search, FileJson,
  Route,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { useRouteAutoDetect, type RouteAutoDetectResult } from "@/hooks/useRouteAutoDetect";
import { supabase } from "@/integrations/supabase/client";
import { runGridwiseProject } from "@/lib/gridwise";
import { filterPackForAudience } from "@/lib/gridwise/commercialEngine";
import { convertGridwiseToDesign } from "@/lib/gridwise/designBridge";
import { convertConnectToDesign } from "@/lib/connectDesignBridge";
import { estimateConnectionCost } from "@/lib/connectionCosts";
import type { VoltageOverride, CostEstimate } from "@/lib/connectionCosts";
import type { GridwiseProject, PipelineProgress, SiteInput, PackAudience } from "@/lib/gridwise/types";
import type { FeasibilityState, DnoKey } from "@/lib/evHub/types";
import type { EquipmentType, CableType } from "@/hooks/useDesignMode";
import { CostEstimatePanel } from "./CostEstimatePanel";
import { OptimiserResultPanel } from "./OptimiserResultPanel";
import { VoltageComparisonPanel } from "./VoltageComparisonPanel";
import { SavedAssessmentsDrawer } from "./SavedAssessmentsDrawer";
import { AssessmentComparisonPanel } from "./AssessmentComparisonPanel";
import { generateAssessmentPdf, exportAssessmentJson } from "@/lib/generateAssessmentPdf";
import { createSnapshot } from "@/lib/snapshotService";
import { runLvOptimiser, type OptimiserResult, type CableCatalogueEntry } from "@/lib/lvOptimiser";
import { runElectricalValidation, type ElectricalValidationResult } from "@/lib/electricalEngine";
import { runVoltageComparison, type VoltageComparisonResult } from "@/lib/voltageComparison";
import { findNearestLvMain, findNearestLvMainForRoute } from "@/lib/gridwise/assetEngine";
import type { LvCableMatch } from "@/lib/gridwise/lvCableParser";
import {
  DNO_OPTIONS,
  FEASIBILITY_STATE_CONFIG,
  SCORE_CONFIG,
  BAND_CONFIG,
  OPTION_LETTERS,
  haversineM,
} from "@/lib/shared/assessmentConstants";

// ── Types ───────────────────────────────────────────────────

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

export interface SavedAssessment {
  id: string;
  label: string;
  timestamp: Date;
  endpoints?: ConnectEndpoints;
  proposedKw: number;
  voltageOverride: VoltageOverride;
  result: ScoreResult | null;
  distances: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  totalEstimate: number;
  voltageLevel: string;
  confidence: string;
  costEstimate?: CostEstimate;
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

interface AssessmentPanelProps {
  lng: number;
  lat: number;
  onClose: () => void;
  /** Route drawn via Connect tool */
  connectEndpoints?: ConnectEndpoints | null;
  /** Pre-drawn boundary */
  boundaryGeojson?: GeoJSON.Polygon;
  /** Map screenshot callback */
  onCaptureScreenshot?: () => Promise<string | null>;
  /** Street view captures */
  streetViewCaptures?: { dataUrl: string; heading: number; pitch: number; label: string }[];
  /** Design elements summary */
  designElements?: { type: string; label: string; count: number }[];
  /** Whether an active study exists */
  hasActiveStudy?: boolean;
  /** Bulk insert callback from useDesignMode */
  onConvertToDesign?: (
    elements: { element_type: EquipmentType | string; label: string; lng: number; lat: number; properties_json: Record<string, unknown> }[],
    cables: { cable_type: CableType | string; label: string; coordinates: [number, number][] }[]
  ) => Promise<number>;
  /** Callback when auto-detect completes */
  onAutoDetectComplete?: (result: RouteAutoDetectResult) => void;
  /** Callback to toggle route-draw mode in the parent MapView */
  onRouteDrawChange?: (active: boolean) => void;
}

// ── Shared UI helpers ───────────────────────────────────────

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

// ── Main Component ──────────────────────────────────────────

export function AssessmentPanel({
  lng, lat, onClose, connectEndpoints, boundaryGeojson,
  onCaptureScreenshot, streetViewCaptures, designElements,
  hasActiveStudy, onConvertToDesign, onAutoDetectComplete,
  onRouteDrawChange,
}: AssessmentPanelProps) {
  const { user, orgId } = useAuth();
  const { toast } = useToast();
  const { data: unitRates } = useUnitRates();
  const autoDetect = useRouteAutoDetect();

  // ── Inputs ──
  const [routeDrawActive, setRouteDrawActive] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [postcode, setPostcode] = useState("");
  const [chargerCount, setChargerCount] = useState("4");
  const [chargerKw, setChargerKw] = useState("50");
  const [diversityFactor, setDiversityFactor] = useState("0.8");
  const [extraneous, setExtraneous] = useState(false);
  const [dnoOverride, setDnoOverride] = useState<DnoKey | "auto">("auto");
  const [voltageOverride, setVoltageOverride] = useState<VoltageOverride>("Auto");

  // ── DNO auto-detection ──
  const [detectedDno, setDetectedDno] = useState<string | null>(null);
  const [dnoDetecting, setDnoDetecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDnoDetecting(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("lookup_dno_by_location", { p_lat: lat, p_lng: lng });
        if (cancelled) return;
        if (!error && data) setDetectedDno(data);
        else setDetectedDno(null);
      } catch {
        if (!cancelled) setDetectedDno(null);
      } finally {
        if (!cancelled) setDnoDetecting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lat, lng]);

  // ── Gridwise Pipeline state ──
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [project, setProject] = useState<GridwiseProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(false);

  // ── Connect/Score state ──
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);

  // ── LV Optimiser state ──
  const [optimiserResult, setOptimiserResult] = useState<OptimiserResult | null>(null);
  const [electricalResult, setElectricalResult] = useState<ElectricalValidationResult | null>(null);
  const [optimiserLoading, setOptimiserLoading] = useState(false);

  // ── Voltage Comparison state ──
  const [comparisonResult, setComparisonResult] = useState<VoltageComparisonResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  // ── LV Cable Match state ──
  const [lvCableMatch, setLvCableMatch] = useState<LvCableMatch | null>(null);
  const [lvCableLoading, setLvCableLoading] = useState(false);
  const [lvCableSearched, setLvCableSearched] = useState(false);

  // ── Cable catalogue ──
  const { data: cableCatalogue } = useQuery({
    queryKey: ["cable-catalogue-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cable_catalogue").select("*");
      if (error) throw error;
      return (data || []) as CableCatalogueEntry[];
    },
  });

  // ── Collapsible sections ──
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [electricalOpen, setElectricalOpen] = useState(false);
  const [commercialOpen, setCommercialOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(false);
  const [boqOpen, setBoqOpen] = useState(false);
  const [packAudience, setPackAudience] = useState<PackAudience>("client");

  // ── Save & Compare state ──
  const [savedAssessments, setSavedAssessments] = useState<SavedAssessment[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[] | null>(null);

  // ── Computed values ──
  const hasDrawnRoute = !!connectEndpoints;
  const proposedKw = Number(chargerCount) * Number(chargerKw) * Number(diversityFactor);
  const resolvedDnoLookup = dnoOverride !== "auto" ? dnoOverride : detectedDno ?? undefined;

  const routeDistanceM = useMemo(() => {
    if (!connectEndpoints) return 0;
    const coords = connectEndpoints.routeCoords;
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      total += haversineM(coords[i - 1], coords[i]);
    }
    return Math.round(total);
  }, [connectEndpoints]);

  const sourceName = connectEndpoints
    ? (connectEndpoints.source.properties.site_name as string) ||
      (connectEndpoints.source.properties.name as string) ||
      (connectEndpoints.source.properties.asset_id as string) ||
      connectEndpoints.source.layerLabel
    : undefined;

  const sourceHeadroomKw = connectEndpoints
    ? (connectEndpoints.source.properties.transformer_headroom_kw as number | undefined) ??
      (connectEndpoints.source.properties.headroom_kw as number | undefined)
    : undefined;

  // Route GeoJSON for the pipeline
  const routeGeojson = useMemo((): GeoJSON.LineString | undefined => {
    if (!connectEndpoints) return undefined;
    return { type: "LineString", coordinates: connectEndpoints.routeCoords };
  }, [connectEndpoints]);

  // Distances for cost estimate (from score-site or drawn route)
  const distances = useMemo(() => {
    // Single source of truth for the *installed* cable length:
    // drawn route + the spur from the nearest existing LV main (if found).
    // The route-aware POC lookup returns 0 m when the drawn route already
    // touches the main, so this never double-counts.
    const effective = routeDistanceM + (lvCableMatch?.distanceM ?? 0);
    if (scoreResult?.distances) {
      return {
        ...scoreResult.distances,
        primary_m: hasDrawnRoute ? effective : scoreResult.distances.primary_m,
        feeder_m: hasDrawnRoute ? effective : scoreResult.distances.feeder_m,
        capacity_segment_m: hasDrawnRoute ? effective : scoreResult.distances.capacity_segment_m,
      };
    }
    if (project?.assets?.distances) {
      return {
        primary_m: hasDrawnRoute ? effective : project.assets.distances.primary_m,
        feeder_m: hasDrawnRoute ? effective : project.assets.distances.feeder_m,
        capacity_segment_m: hasDrawnRoute ? effective : project.assets.distances.capacity_segment_m,
      };
    }
    return { primary_m: effective, feeder_m: effective, capacity_segment_m: effective };
  }, [scoreResult, project, routeDistanceM, hasDrawnRoute, lvCableMatch]);

  // ── Mains extension status (NPG / standard ICP rule: > 25 m) ──
  // Used by both the side panel and the PDF to show the cable composition.
  const mainsExtensionThresholdM = unitRates?.mains_extension_threshold_m ?? 25;
  const effectiveCableLengthM = useMemo(
    () => routeDistanceM + (lvCableMatch?.distanceM ?? 0),
    [routeDistanceM, lvCableMatch],
  );
  const needsMainsExtension =
    hasDrawnRoute && effectiveCableLengthM > mainsExtensionThresholdM;
  const serviceCableLengthM = needsMainsExtension
    ? mainsExtensionThresholdM
    : effectiveCableLengthM;
  const mainsExtensionLengthM = needsMainsExtension
    ? Math.max(0, effectiveCableLengthM - mainsExtensionThresholdM)
    : 0;

  // ── Run Gridwise Pipeline ──
  const handleRunPipeline = useCallback(async () => {
    if (!resolvedDnoLookup) {
      toast({ title: "DNO not detected", description: "No DNO licence area found. Please select a DNO manually.", variant: "destructive" });
      return;
    }

    setRunning(true);
    setProject(null);
    setSaved(false);
    setConverted(false);

    try {
      const input: SiteInput = {
        site_name: siteName || sourceName || "Unnamed Site",
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

      let mapScreenshot: string | undefined;
      if (onCaptureScreenshot) {
        try { mapScreenshot = (await onCaptureScreenshot()) ?? undefined; } catch {}
      }

      const result = await runGridwiseProject(input, {
        unitRates: unitRates ?? undefined,
        onProgress: setProgress,
        visuals: { map_screenshot: mapScreenshot },
        dnoLookupResult: resolvedDnoLookup,
      });

      setProject(result);
      toast({ title: "Assessment complete", description: `Run ID: ${result.run_id}` });

      // ── Auto-locate the existing LV main we'll be connecting onto ──
      // Route-aware lookup: measures spur from any point on the drawn route
      // (returns 0 m if the route already touches the main). Falls back to
      // the destination pin if no route was drawn.
      try {
        setLvCableSearched(true);
        const match = connectEndpoints
          ? await findNearestLvMainForRoute(connectEndpoints.routeCoords)
          : await findNearestLvMain(lng, lat);
        setLvCableMatch(match);
      } catch (err) {
        console.warn("Auto LV main lookup failed:", err);
      }

      // Also run score-site if we have a drawn route (supplementary GREEN/AMBER/RED)
      if (hasDrawnRoute && connectEndpoints) {
        try {
          const [dstLng, dstLat] = connectEndpoints.destination.lngLat;
          const res = await supabase.functions.invoke("score-site", {
            body: { lng: dstLng, lat: dstLat, proposed_kw: proposedKw, site_name: input.site_name },
          });
          if (!res.error) setScoreResult(res.data);
        } catch {}
      }
    } catch (err: any) {
      toast({ title: "Pipeline failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }, [siteName, postcode, lat, lng, proposedKw, chargerCount, chargerKw, diversityFactor, extraneous, routeGeojson, boundaryGeojson, voltageOverride, dnoOverride, unitRates, onCaptureScreenshot, toast, resolvedDnoLookup, hasDrawnRoute, connectEndpoints, sourceName]);

  // ── Save to Portfolio ──
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
        org_id: orgId,
      } as any);
      if (error) throw error;
      toast({ title: "Site saved to portfolio" });
      setSaved(true);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [project, user, orgId, toast]);

  // ── Generate PDF (Functional Proposal) ──
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const handleGeneratePdf = useCallback(async () => {
    if (!project) return;
    setGeneratingPdf(true);
    try {
      let mapScreenshot: string | undefined;
      if (onCaptureScreenshot) {
        try { mapScreenshot = (await onCaptureScreenshot()) ?? undefined; } catch {}
      }

      const sub = project.assets.nearest_substation;
      const sizing = project.electrical?.sizing;
      const headroomKw = sourceHeadroomKw ?? sub?.headroom_kw ?? null;
      const proposedKwRounded = Math.round(proposedKw);
      const headroomAdequate = headroomKw != null
        ? headroomKw >= proposedKwRounded
        : null;

      generateAssessmentPdf({
        siteName: project.site.site_name,
        postcode: project.site.postcode ?? undefined,
        proposedKw: proposedKwRounded,
        lat,
        lng,
        score: project.feasibility.viability_band,
        reasons: project.audit.reason_codes ?? [],
        nextSteps: project.audit?.warnings ?? [],
        distances: project.assets.distances,
        constraints: {
          capacity_flag: project.assets.constraints.capacity_flag,
          ndp_intersect: project.assets.constraints.ndp_intersect,
          wayleave_intersect: project.assets.constraints.wayleave_intersect,
          min_footway_m: project.assets.constraints.min_footway_m,
          min_carriageway_m: project.assets.constraints.min_carriageway_m,
        },
        mapScreenshot,
        electricalResult: project.electrical?.validation ?? null,
        designElements: designElements?.map(d => ({ type: d.label, count: d.count })),
        unitRates: unitRates ?? undefined,
        voltageOverride,
        nearestHeadroomKw: headroomKw ?? undefined,
        streetViewCaptures,
        // Scoring & intelligence
        gridViabilityIndex: project.feasibility.viability_index,
        deploymentClass: project.feasibility.deployment_class,
        gridReadiness: project.feasibility.grid_readiness,
        reinforcementProbability: project.feasibility.reinforcement_probability,
        bestPoc: sub?.name ?? null,
        recommendedVoltage: project.feasibility?.cable_selection ? "LV" : null,
        cableLengthEst: project.route?.route_quantities?.total_length_m ?? null,
        // ── Connection cable details (matches BoQ) ──
        // Service cable in the BoQ is always 35mm² CNE for LV connections.
        serviceCableUsed: "35mm² concentric CNE",
        // Existing LV main we're tapping into — sourced from the spatial POC lookup, not the EV Hub sizing engine.
        connectingOntoCable: lvCableMatch?.conductingSectionType ?? null,
        connectingOntoDistanceM: lvCableMatch?.distanceM ?? null,
        connectingOntoEvCompatible: lvCableMatch?.evCompatible ?? null,
        connectingOntoDirectKva: lvCableMatch?.directKva ?? null,
        totalDemandKva: sizing?.total_demand_kva ?? null,
        upstreamCapacityKw: sub?.capacity_kw ?? null,
        upstreamUtilisationPct: sub?.utilisation_pct ?? null,
        upstreamHeadroomKw: headroomKw,
        headroomAdequate,
        reinforcementTrigger: sizing?.reinforcement_trigger ?? null,
        feasibilityState: project.feasibility.feasibility_state ?? null,
        engineeringReasonCodes: sizing?.reason_codes ?? [],
      });
      toast({ title: "PDF generated", description: "Functional Proposal downloaded." });
    } catch (err: any) {
      toast({ title: "PDF generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  }, [project, lat, lng, proposedKw, sourceHeadroomKw, onCaptureScreenshot, designElements, unitRates, voltageOverride, streetViewCaptures, toast, lvCableMatch]);

  // ── Convert to Design ──
  const handleConvertToDesign = useCallback(async () => {
    if (!onConvertToDesign) return;
    setConverting(true);
    try {
      if (project) {
        const result = convertGridwiseToDesign(project);
        const count = await onConvertToDesign(result.elements, result.cables);
        toast({ title: "Converted to Design Mode", description: `${count} items placed on map` });
      } else if (connectEndpoints && scoreResult) {
        const costEst = proposedKw > 0
          ? estimateConnectionCost({ proposed_kw: proposedKw, distances, constraints: scoreResult.constraints, nearest_headroom_kw: sourceHeadroomKw, voltage_override: voltageOverride })
          : null;
        const vLevel = costEst?.voltage_level ?? (voltageOverride === "Auto" ? "LV" : voltageOverride);
        const designResult = convertConnectToDesign(connectEndpoints, {
          voltageLevel: vLevel,
          proposedKw: proposedKw,
          sourceName: sourceName || "Asset",
        });
        const count = await onConvertToDesign(designResult.elements, designResult.cables);
        toast({ title: "Converted to Design Mode", description: `${count} items placed on map` });
      }
      setConverted(true);
    } catch (err: any) {
      toast({ title: "Conversion failed", description: err.message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  }, [project, connectEndpoints, scoreResult, onConvertToDesign, proposedKw, distances, sourceHeadroomKw, voltageOverride, sourceName, toast]);

  // ── Save option (for comparison) ──
  const handleSaveOption = useCallback(() => {
    if (!project && !scoreResult) return;
    if (savedAssessments.length >= 10) {
      toast({ title: "Max 10 saved", description: "Delete an option before saving more.", variant: "destructive" });
      return;
    }
    const costEst = proposedKw > 0
      ? estimateConnectionCost({ proposed_kw: proposedKw, distances, constraints: scoreResult?.constraints, nearest_headroom_kw: sourceHeadroomKw, voltage_override: voltageOverride })
      : undefined;

    const letter = OPTION_LETTERS[savedAssessments.length] ?? String(savedAssessments.length + 1);
    const saved: SavedAssessment = {
      id: crypto.randomUUID(),
      label: `Option ${letter} — ${voltageOverride === "Auto" ? (costEst?.voltage_level ?? "Auto") : voltageOverride} ${Math.round(proposedKw)}kW`,
      timestamp: new Date(),
      endpoints: connectEndpoints ?? undefined,
      proposedKw: proposedKw,
      voltageOverride,
      result: scoreResult,
      distances,
      totalEstimate: project?.commercial?.cost_range?.mid ?? costEst?.total_estimate ?? 0,
      voltageLevel: costEst?.voltage_level ?? voltageOverride,
      confidence: costEst?.confidence ?? "low",
      costEstimate: costEst,
    };
    setSavedAssessments((prev) => [...prev, saved]);
    toast({ title: `Saved as ${saved.label}` });
  }, [project, scoreResult, proposedKw, distances, sourceHeadroomKw, voltageOverride, connectEndpoints, savedAssessments, toast]);

  // ── Progress ──
  const progressPct = progress
    ? progress.stage === "COMPLETE" ? 100
    : progress.stage === "ERROR" ? 0
    : Math.round(((progress.stage_index + 1) / progress.total_stages) * 100)
    : 0;

  const filteredPack = project ? filterPackForAudience(project.commercial, packAudience) : null;
  const fState = project ? FEASIBILITY_STATE_CONFIG[project.feasibility.feasibility_state] : null;
  const bandCfg = project ? BAND_CONFIG[project.feasibility.viability_band] || BAND_CONFIG.AMBER : null;
  const sc = scoreResult ? SCORE_CONFIG[scoreResult.score] || SCORE_CONFIG.AMBER : null;

  // ── Comparison mode ──
  if (comparisonIds) {
    const selected = savedAssessments.filter((a) => comparisonIds.includes(a.id));
    return <AssessmentComparisonPanel assessments={selected} onBack={() => setComparisonIds(null)} />;
  }

  return (
    <div className="absolute top-0 right-0 z-20 h-full w-[440px] border-l bg-background shadow-xl flex flex-col pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Assess</span>
          {hasDrawnRoute && <Badge variant="secondary" className="text-[9px]">Route Drawn</Badge>}
          {project && <Badge variant="outline" className="text-[9px] font-mono">{project.run_id}</Badge>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* ── Mode Toggle: Pin Drop / Draw Route ── */}
          <div className="flex gap-1 rounded-md border bg-muted/30 p-1">
            <Button
              variant={routeDrawActive ? "ghost" : "default"}
              size="sm"
              className="flex-1 h-8 text-xs gap-1.5"
              onClick={() => {
                setRouteDrawActive(false);
                onRouteDrawChange?.(false);
              }}
            >
              <MapPin className="h-3.5 w-3.5" />Pin Drop
            </Button>
            <Button
              variant={routeDrawActive ? "default" : "ghost"}
              size="sm"
              className="flex-1 h-8 text-xs gap-1.5"
              onClick={() => {
                setRouteDrawActive(true);
                onRouteDrawChange?.(true);
              }}
            >
              <Route className="h-3.5 w-3.5" />Draw Route
            </Button>
          </div>

          {routeDrawActive && !hasDrawnRoute && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Draw Route Mode</p>
              <p>Click the map to select your POC (on an asset or any location), then click to add waypoints. Double-click or press Finish to complete the route to your feeder pillar location.</p>
            </div>
          )}

          {/* ── Location ── */}
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
              {routeGeojson && <Badge variant="secondary" className="text-[9px]">Route drawn ✓</Badge>}
              {boundaryGeojson && <Badge variant="secondary" className="text-[9px]">Boundary set ✓</Badge>}
            </div>
          </div>

          {/* ── Source Asset (from drawn route) ── */}
          {hasDrawnRoute && connectEndpoints && (
            <>
              <div className="rounded-md border bg-muted/20 p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Source Asset</p>
                <p className="text-sm font-semibold">{sourceName}</p>
                <p className="text-xs text-muted-foreground">{connectEndpoints.source.layerLabel}</p>
                {sourceHeadroomKw !== undefined && (
                  <p className="text-xs">Headroom: <span className="font-medium">{sourceHeadroomKw.toLocaleString()} kW</span></p>
                )}
              </div>

              {/* Route distance */}
              <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {lvCableMatch ? "Total Cable Length" : "Route Distance"}
                </p>
                <p className="text-2xl font-bold text-foreground">{effectiveCableLengthM.toLocaleString()} m</p>
                {lvCableMatch ? (
                  <span className="text-[10px] text-muted-foreground">
                    {routeDistanceM.toLocaleString()} m drawn
                    {lvCableMatch.distanceM > 0
                      ? ` + ${Math.round(lvCableMatch.distanceM)} m spur to existing LV main`
                      : " · route already touches LV main"}
                  </span>
                ) : connectEndpoints.routeCoords.length > 2 ? (
                  <span className="text-[10px] text-muted-foreground">
                    {connectEndpoints.routeCoords.length - 2} waypoint{connectEndpoints.routeCoords.length - 2 !== 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>

              {/* Auto-detect from map data */}
              <Button
                variant="outline"
                className="w-full"
                disabled={autoDetect.loading}
                onClick={async () => {
                  const res = await autoDetect.detect(connectEndpoints.routeCoords);
                  if (res && onAutoDetectComplete) onAutoDetectComplete(res);
                }}
              >
                {autoDetect.loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scanning route…</>
                ) : (
                  <><Radar className="mr-2 h-4 w-4" />Auto-detect Route Data</>
                )}
              </Button>

              {/* Auto-detect results */}
              {autoDetect.result && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Route Intelligence</p>
                  {autoDetect.result.cable_candidates.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium">{autoDetect.result.cable_candidates.length} nearby cables</p>
                      {autoDetect.result.cable_candidates.slice(0, 3).map((c, i) => (
                        <div key={i} className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground truncate">{c.name || c.asset_id || "Cable"} {c.voltage_kv ? `(${c.voltage_kv}kV)` : ""}</span>
                          <span className="font-mono">{Math.round(c.distance_m)}m</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {autoDetect.result.surface_segments.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Surface classification</p>
                      <div className="flex flex-wrap gap-1">
                        {autoDetect.result.surface_segments.slice(0, 5).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-[9px]">{s.surface_type} · {Math.round(s.length_m)}m</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {autoDetect.result.crossings.length > 0 && (
                    <p className="text-xs font-medium">{autoDetect.result.crossings.length} crossings detected</p>
                  )}
                </div>
              )}

              {/* LV Cable Search */}
              <Button
                variant="outline"
                className="w-full"
                disabled={lvCableLoading}
                onClick={async () => {
                  setLvCableLoading(true);
                  setLvCableSearched(true);
                  try {
                    // Route-aware: spur is measured from the drawn polyline,
                    // not just the destination pin, so it never double-counts.
                    const match = await findNearestLvMainForRoute(connectEndpoints.routeCoords);
                    setLvCableMatch(match);
                    if (match) toast({ title: "LV main found", description: `${match.conductingSectionType} at ${Math.round(match.distanceM)}m` });
                    else toast({ title: "No compatible LV main", description: "No compatible LV underground main within 100m search radius", variant: "destructive" });
                  } catch (err: any) {
                    toast({ title: "LV search failed", description: err.message, variant: "destructive" });
                  } finally {
                    setLvCableLoading(false);
                  }
                }}
              >
                {lvCableLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Searching LV mains…</>
                ) : (
                  <><Search className="mr-2 h-4 w-4" />Find Nearest Compatible LV Main</>
                )}
              </Button>

              {/* LV Cable Match Results */}
              {lvCableSearched && !lvCableLoading && (
                lvCableMatch ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Cable className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Nearest Compatible LV Main</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                      <span className="text-muted-foreground">Cable Type</span>
                      <span className="font-medium text-right truncate">{lvCableMatch.conductingSectionType}</span>
                      <span className="text-muted-foreground">Distance</span>
                      <span className="font-medium text-right">{Math.round(lvCableMatch.distanceM)} m</span>
                      <span className="text-muted-foreground">Direct kVA</span>
                      <span className="font-medium text-right">{lvCableMatch.directKva}</span>
                      <span className="text-muted-foreground">Ducted kVA</span>
                      <span className="font-medium text-right">{lvCableMatch.ductedKva}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700 dark:text-emerald-400">
                        {lvCableMatch.evCompatible ? "EV Compatible" : "Not Compatible"}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">No compatible LV underground main found</span>
                    </div>
                  </div>
                )
              )}
            </>
          )}

          {/* ── Inputs ── */}
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
                    <SelectItem value="Auto">Auto (from kW)</SelectItem>
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

          {/* ── Run Button ── */}
          <Button onClick={handleRunPipeline} disabled={running} className="w-full" size="lg">
            {running ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{progress?.message || "Running..."}</>
            ) : (
              <><Zap className="mr-2 h-4 w-4" />Run Assessment</>
            )}
          </Button>

          {/* Progress */}
          {running && progress && (
            <div className="space-y-1">
              <Progress value={progressPct} className="h-2" />
              <p className="text-[10px] text-muted-foreground text-center">{progress.message}</p>
            </div>
          )}

          {/* ====================== RESULTS ====================== */}

          {/* ── Site Score (GREEN/AMBER/RED) ── */}
          {scoreResult && sc && (
            <div className={`rounded-lg border p-4 ${sc.bg}`}>
              <div className="flex items-center gap-3">
                <sc.icon className={`h-6 w-6 ${sc.color}`} />
                <div>
                  <span className={`text-lg font-bold ${sc.color}`}>{scoreResult.score}</span>
                  <p className={`text-xs ${sc.color}`}>{sc.label}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Gridwise Results ── */}
          {project && fState && bandCfg && (
            <>
              {/* Feasibility Verdict */}
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
                    <span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-primary" />Asset Discovery</span>
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
                    {project.assets.constraints.ndp_intersect && <MetricRow label="NDP Conflict" badge="Yes" badgeVariant="destructive" />}
                    {project.assets.constraints.wayleave_intersect && <MetricRow label="Wayleave" badge="Required" badgeVariant="destructive" />}
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
                      <Truck className="h-3.5 w-3.5 text-primary" />Route & Streetworks
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
                    <MetricRow label="Footway Compliant" badge={project.route.streetworks.footway_compliant === null ? "Unknown" : project.route.streetworks.footway_compliant ? "Yes" : "No"} badgeVariant={project.route.streetworks.footway_compliant === false ? "destructive" : "outline"} />
                    <MetricRow label="Traffic Control" badge={project.route.streetworks.traffic_control_required ? "Required" : "Not required"} badgeVariant={project.route.streetworks.traffic_control_required ? "secondary" : "outline"} />
                    <MetricRow label="Permit Escalation" badge={project.route.streetworks.permit_escalation_required ? "Likely" : "No"} badgeVariant={project.route.streetworks.permit_escalation_required ? "destructive" : "outline"} />
                  </div>
                  {project.route.streetworks.warnings.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground font-medium">Warnings</p>
                      {project.route.streetworks.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{w}
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
                    <span className="flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-primary" />Electrical & Safety</span>
                    {electricalOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1">
                  <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                    <MetricRow
                      label="Connecting Onto (Existing LV Main)"
                      value={lvCableMatch?.conductingSectionType ?? "Run POC lookup to populate"}
                    />
                    {lvCableMatch && (
                      <>
                        <MetricRow
                          label="Spur to POC"
                          value={lvCableMatch.distanceM < 1
                            ? "0 m (route touches main)"
                            : `${Math.round(lvCableMatch.distanceM)} m (included in cable total)`}
                        />
                        <MetricRow label="Existing Main Capacity" value={`${lvCableMatch.directKva} kVA (direct) · ${lvCableMatch.ductedKva} kVA (ducted)`} />
                        <MetricRow
                          label="EV Compatibility"
                          badge={lvCableMatch.evCompatible ? "Compatible" : "Not Compatible"}
                          badgeVariant={lvCableMatch.evCompatible ? "outline" : "destructive"}
                        />
                      </>
                    )}
                    {hasDrawnRoute && (
                      <>
                        <MetricRow
                          label="Cable Composition"
                          badge={needsMainsExtension ? "Mains Extension Required" : "Standard Service"}
                          badgeVariant={needsMainsExtension ? "secondary" : "outline"}
                        />
                        {needsMainsExtension ? (
                          <>
                            <MetricRow
                              label="Service Cable"
                              value={`${serviceCableLengthM} m × 35mm² concentric CNE`}
                            />
                            <MetricRow
                              label="Mains Extension"
                              value={`${mainsExtensionLengthM} m × 185mm² 4c XLPE/SWA`}
                            />
                          </>
                        ) : (
                          <MetricRow
                            label="Service Cable"
                            value={`${serviceCableLengthM} m × 35mm² concentric CNE`}
                          />
                        )}
                      </>
                    )}
                    {!hasDrawnRoute && (
                      <MetricRow label="New Service Cable (BoQ)" value="35mm² concentric CNE" />
                    )}
                    <MetricRow label="Reinforcement Trigger" badge={project.electrical.sizing.reinforcement_trigger ? "Yes" : "No"} badgeVariant={project.electrical.sizing.reinforcement_trigger ? "secondary" : "outline"} />
                    <MetricRow label="Earthing" badge={project.electrical.earthing.review_required ? "Review Required" : "OK"} badgeVariant={project.electrical.earthing.review_required ? "destructive" : "outline"} />
                    <MetricRow label="Reinforcement" badge={project.electrical.reinforcement.state !== "NO_REINFORCEMENT" ? project.electrical.reinforcement.state.replace(/_/g, " ") : "None"} badgeVariant={project.electrical.reinforcement.state !== "NO_REINFORCEMENT" ? "destructive" : "outline"} />
                    {project.electrical.validation && (
                      <>
                        <Separator className="my-1" />
                        <MetricRow label="Voltage Drop" value={`${project.electrical.validation.voltage_drop.total_vd_pct.toFixed(1)}%`} />
                        <MetricRow label="VD Status" badge={project.electrical.validation.voltage_drop.pass ? "PASS" : "FAIL"} badgeVariant={project.electrical.validation.voltage_drop.pass ? "outline" : "destructive"} />
                        <MetricRow label="Overall" badge={project.electrical.validation.overall_pass ? "PASS" : "FAIL"} badgeVariant={project.electrical.validation.overall_pass ? "outline" : "destructive"} />
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* ── Engine 5: Commercial ── */}
              <Collapsible open={commercialOpen} onOpenChange={setCommercialOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
                    <span className="flex items-center gap-2"><PoundSterling className="h-3.5 w-3.5 text-primary" />Commercial</span>
                    {commercialOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-1">
                  <div className="rounded-md border bg-primary/5 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Estimated Cost Range</p>
                    <div className="flex items-baseline justify-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">£{project.commercial.cost_range.low.toLocaleString()}</span>
                      <span className="text-lg font-bold text-primary">£{project.commercial.cost_range.mid.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">£{project.commercial.cost_range.high.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(["client", "installer", "dno"] as PackAudience[]).map((aud) => (
                      <Button key={aud} variant={packAudience === aud ? "default" : "outline"} size="sm" className="flex-1 text-[10px] h-7 capitalize" onClick={() => setPackAudience(aud)}>
                        <Eye className="h-3 w-3 mr-1" />{aud}
                      </Button>
                    ))}
                  </div>
                  {filteredPack && (
                    <div className="rounded-md border bg-muted/10 p-3 space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium capitalize">{packAudience} View</p>
                      {filteredPack.show_pricing && filteredPack.total_shown != null && <MetricRow label="Total" value={`£${filteredPack.total_shown.toLocaleString()}`} />}
                      {!filteredPack.show_pricing && <p className="text-[10px] text-muted-foreground italic">No pricing shown for this audience</p>}
                      <p className="text-[10px] text-muted-foreground">{filteredPack.visible_items.length} line items</p>
                    </div>
                  )}
                  <div className="rounded-md border bg-muted/10 p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium">Engineering BOQ</p>
                    <MetricRow label="Electrical Items" value={`${project.commercial.engineering_boq.electrical.length}`} />
                    <MetricRow label="Civils Items" value={`${project.commercial.engineering_boq.civils.length}`} />
                    <MetricRow label="TM Items" value={`${project.commercial.engineering_boq.traffic_mgmt.length}`} />
                    <MetricRow label="Fees" value={`${project.commercial.engineering_boq.fees.length}`} />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* ── Cost Estimate (detailed breakdown from Connect methodology) ── */}
              {proposedKw > 0 && (
                <>
                  <Separator />
                  <CostEstimatePanel
                    proposed_kw={proposedKw}
                    distances={distances}
                    constraints={scoreResult?.constraints || project?.assets?.constraints}
                    nearest_headroom_kw={sourceHeadroomKw ?? project?.assets?.nearest_substation?.headroom_kw}
                    voltageOverride={voltageOverride}
                  />
                </>
              )}

              {/* ── LV Optimiser ── */}
              {proposedKw > 0 && (voltageOverride === "Auto" || voltageOverride === "LV") && (
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
                        const optRes = runLvOptimiser({
                          proposed_kw: proposedKw,
                          route_length_m: hasDrawnRoute ? effectiveCableLengthM : (project?.route?.route_quantities?.total_length_m ?? 100),
                          catalogue: cableCatalogue,
                          unit_rates: unitRates,
                        });
                        setOptimiserResult(optRes);
                        const sel = optRes.selected;
                        if (sel) {
                          const mains = sel.network_edges.find(e => e.section === "mains")!;
                          const service = sel.network_edges.find(e => e.section === "service")!;
                          setElectricalResult(runElectricalValidation({
                            proposed_kw: proposedKw,
                            mains_length_m: mains.length_m,
                            service_length_m: service.length_m,
                            mains_impedance_per_km: mains.impedance_per_km,
                            service_impedance_per_km: service.impedance_per_km,
                            mains_rating_a: mains.current_rating_a,
                            service_rating_a: service.current_rating_a,
                          }));
                        }
                      } catch (err: any) {
                        toast({ title: "Optimiser error", description: err.message, variant: "destructive" });
                      } finally {
                        setOptimiserLoading(false);
                      }
                    }}
                  >
                    {optimiserLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running…</> : <><Activity className="mr-2 h-4 w-4" />Run LV Feasibility</>}
                  </Button>
                  {optimiserResult && <OptimiserResultPanel result={optimiserResult} />}
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
                    </div>
                  )}
                </>
              )}

              {/* ── Voltage Comparison ── */}
              {proposedKw > 0 && (
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
                          proposed_kw: proposedKw,
                          route_length_m: hasDrawnRoute ? effectiveCableLengthM : (project?.route?.route_quantities?.total_length_m ?? 100),
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
                    {comparisonLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Comparing…</> : <><Zap className="mr-2 h-4 w-4" />Compare All Voltages</>}
                  </Button>
                  {comparisonResult && <VoltageComparisonPanel result={comparisonResult} />}
                </>
              )}

              {/* ── Audit Trail ── */}
              <Collapsible open={auditOpen} onOpenChange={setAuditOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs h-8">
                    <span className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary" />Audit Trail
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
                    a.download = `assessment-${project.run_id}.json`;
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

              {/* Generate Functional Proposal PDF */}
              <Button
                variant="default"
                className="w-full"
                onClick={handleGeneratePdf}
                disabled={generatingPdf}
              >
                {generatingPdf ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating PDF…</>
                ) : (
                  <><FileText className="mr-2 h-4 w-4" />Generate Functional Proposal (PDF)</>
                )}
              </Button>

              {/* Save option for comparison */}
              <Button variant="secondary" className="w-full" onClick={handleSaveOption}>
                <Save className="mr-2 h-4 w-4" />Save Option
              </Button>

              {/* ── Convert to Design Mode ── */}
              {onConvertToDesign && hasActiveStudy && (
                <div className="space-y-2">
                  {!converted ? (
                    <Button variant="secondary" className="w-full" disabled={converting} onClick={handleConvertToDesign}>
                      {converting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Converting…</> : <><Paintbrush className="mr-2 h-4 w-4" />Convert to Design Mode</>}
                    </Button>
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 flex items-center justify-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-xs text-emerald-700 font-medium">Design elements placed on map</span>
                    </div>
                  )}
                </div>
              )}
              {!hasActiveStudy && project && (
                <p className="text-[10px] text-muted-foreground text-center">Open a study to enable design conversion</p>
              )}
            </>
          )}

          {/* ── Score-only results (when no pipeline yet) ── */}
          {scoreResult && !project && (
            <>
              {scoreResult.constraints && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Constraints</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NDP Intersect</span>
                      <Badge variant={scoreResult.constraints.ndp_intersect ? "destructive" : "outline"}>{scoreResult.constraints.ndp_intersect ? "Yes" : "No"}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Wayleave</span>
                      <Badge variant={scoreResult.constraints.wayleave_intersect ? "destructive" : "outline"}>{scoreResult.constraints.wayleave_intersect ? "Yes" : "No"}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capacity</span>
                      <Badge variant="outline">{scoreResult.constraints.capacity_flag}</Badge>
                    </div>
                  </div>
                </div>
              )}

              {proposedKw > 0 && (
                <>
                  <Separator />
                  <CostEstimatePanel
                    proposed_kw={proposedKw}
                    distances={distances}
                    constraints={scoreResult.constraints}
                    nearest_headroom_kw={sourceHeadroomKw}
                    voltageOverride={voltageOverride}
                  />
                </>
              )}
            </>
          )}

          {/* ── Saved assessments drawer ── */}
          <SavedAssessmentsDrawer
            assessments={savedAssessments}
            onDelete={(id) => setSavedAssessments((prev) => prev.filter((a) => a.id !== id))}
            onCompare={(ids) => setComparisonIds(ids)}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
