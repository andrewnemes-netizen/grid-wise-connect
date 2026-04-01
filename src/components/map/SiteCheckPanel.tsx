import { useState, useMemo } from "react";
import { X, MapPin, Zap, AlertTriangle, CheckCircle, XCircle, Save, Loader2, Search, ClipboardCheck, FolderOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { NetworkVisibilityPanel } from "./NetworkVisibilityPanel";
import { CostEstimatePanel } from "./CostEstimatePanel";
import { generateAssessmentPdf } from "@/lib/generateAssessmentPdf";
import { fetchAllRoadRoutes } from "@/lib/roadRoute";
import { useUnitRates } from "@/hooks/useUnitRates";
import { findNearestLvMain, findNearestHvAsset } from "@/lib/gridwise/assetEngine";

interface SiteCheckPanelProps {
  lng: number | null;
  lat: number | null;
  onClose: () => void;
  onSaved?: () => void;
  onConnectionLines?: (lines: ConnectionLine[]) => void;
  onCaptureMapScreenshot?: () => Promise<{ location: string | null; route: string | null }>;
}

export interface ConnectionLine {
  id: string;
  label: string;
  coords: [number, number][];
  color: string;
  distance_m: number;
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
  nearest_points?: { primary?: any; feeder?: any; cable?: any; capacity_segment?: any };
}

/** Parse a coordinate that may be [lng,lat] tuple or GeoJSON Point */
function parseCoord(val: unknown): [number, number] | null {
  if (Array.isArray(val) && val.length >= 2 && typeof val[0] === "number" && typeof val[1] === "number") {
    return [val[0], val[1]];
  }
  if (val && typeof val === "object" && "type" in (val as any) && (val as any).type === "Point") {
    const coords = (val as any).coordinates;
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === "number") return [coords[0], coords[1]];
  }
  return null;
}

const SITE_TYPES = [
  { value: "depot", label: "Depot" },
  { value: "workplace", label: "Workplace" },
  { value: "public", label: "Public" },
  { value: "fleet", label: "Fleet" },
  { value: "other", label: "Other" },
];

const scoreConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  GREEN: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Viable" },
  AMBER: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Possible" },
  RED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Challenging" },
};

const STEPS = [
  { num: 1, label: "Find Location", icon: Search },
  { num: 2, label: "Assess Viability", icon: ClipboardCheck },
  { num: 3, label: "Save to Portfolio", icon: FolderOpen },
];

export function SiteCheckPanel({ lng, lat, onClose, onSaved, onConnectionLines, onCaptureMapScreenshot }: SiteCheckPanelProps) {
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
  const [includeFeederPillar, setIncludeFeederPillar] = useState(true);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [routeCableDistanceM, setRouteCableDistanceM] = useState<number | null>(null);

  const pkw = Number(proposedKw) || 0;

  const effectiveDistances = useMemo(() => {
    const base = result?.distances;
    if (!base) return null;
    if (!routeCableDistanceM || routeCableDistanceM <= 0) return base;

    if (pkw <= 80) {
      return { ...base, capacity_segment_m: routeCableDistanceM };
    }
    if (pkw <= 1500) {
      return { ...base, feeder_m: routeCableDistanceM };
    }
    return { ...base, primary_m: routeCableDistanceM };
  }, [result?.distances, routeCableDistanceM, pkw]);

  const currentStep = saved ? 3 : result ? 2 : 1;

  const handleScore = async () => {
    if (!lng || !lat) return;
    setLoading(true);
    setRouteCableDistanceM(null);
    try {
      const res = await supabase.functions.invoke("score-site", {
        body: { lng, lat, proposed_kw: pkw, site_name: siteName, postcode, site_type: siteType },
      });
      if (res.error) throw res.error;
      setResult(res.data);

      // ── Find actual cable POC using spatial RPC ──
      const origin: [number, number] = [lng, lat];
      let pocCoord: [number, number] | null = null;
      let pocDistance = 0;

      const isLv = (pkw / 0.95) <= 275; // 275 kVA threshold
      if (isLv) {
        try {
          const lvMatch = await findNearestLvMain(lng, lat);
          if (lvMatch) {
            pocCoord = [lvMatch.snapLon, lvMatch.snapLat];
            pocDistance = lvMatch.snapDistanceM ?? lvMatch.distanceM;
          }
        } catch (e) {
          console.warn("LV cable search for route failed:", e);
        }
      } else {
        try {
          const hvMatch = await findNearestHvAsset(lng, lat, pkw);
          if (hvMatch) {
            pocCoord = [hvMatch.snapLon, hvMatch.snapLat];
            pocDistance = hvMatch.snapDistanceM;
          }
        } catch (e) {
          console.warn("HV asset search for route failed:", e);
        }
      }

      // Fallback to score-site nearest_points
      if (!pocCoord && res.data.nearest_points) {
        const np = res.data.nearest_points;
        const cableCoord = parseCoord(np.cable) || parseCoord(np.capacity_segment);
        const feederCoord = parseCoord(np.feeder);
        const primaryCoord = parseCoord(np.primary);
        pocCoord = cableCoord || feederCoord || primaryCoord;
        pocDistance = cableCoord
          ? (res.data.distances?.capacity_segment_m || 0)
          : feederCoord
            ? (res.data.distances?.feeder_m || 0)
            : (res.data.distances?.primary_m || 0);
      }

      if (pocCoord && onConnectionLines) {
        const lineInputs = [
          { id: "line-cable", label: "Proposed Cable Route", origin, destination: pocCoord, color: "#2ecc71", distance_m: pocDistance },
        ];
        const roadLines = await fetchAllRoadRoutes(lineInputs);
        const primaryLine = roadLines.find((line) => line.id === "line-cable") ?? roadLines[0];
        setRouteCableDistanceM(primaryLine?.distance_m ?? null);
        onConnectionLines(roadLines);
      }
    } catch (err: any) {
      toast({ title: "Scoring failed", description: err.message, variant: "destructive" });
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
        score: result.score,
        score_reasons: result.reasons,
        connection_options: effectiveDistances || result.distance_bands || result.distances || [],
        next_steps: result.next_steps,
        created_by: user.id,
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

  const sc = result ? scoreConfig[result.score] || scoreConfig.AMBER : null;

  return (
    <div className="absolute top-0 right-0 z-20 h-full w-96 border-l bg-background shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Site Check</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Step indicator */}
      <div className="px-4 py-3 border-b bg-muted/10">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => (
            <div key={step.num} className="flex items-center gap-1.5">
              <div className={`flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold transition-colors ${
                currentStep >= step.num ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {step.num}
              </div>
              <span className={`text-[11px] hidden sm:inline ${currentStep >= step.num ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {step.label}
              </span>
              {i < STEPS.length - 1 && <div className={`w-4 h-px mx-1 ${currentStep > step.num ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Location */}
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">📍 Location</p>
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
                    {SITE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox id="feeder-pillar-sc" checked={includeFeederPillar} onCheckedChange={(v) => setIncludeFeederPillar(!!v)} />
              <Label htmlFor="feeder-pillar-sc" className="text-xs cursor-pointer">Include feeder pillar</Label>
            </div>
          </div>

          <Button onClick={handleScore} disabled={loading || !lng || !lat} className="w-full">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Assessing Viability…</> : <><Zap className="mr-2 h-4 w-4" />Assess Connection Viability</>}
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

              {/* Distances / Bands */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connection Proximity</p>
                {isInternal && effectiveDistances ? (
                  <div className="space-y-1.5">
                    {[
                      { label: "Primary Substation", val: effectiveDistances.primary_m, color: "#e74c3c" },
                      { label: "Feeder", val: effectiveDistances.feeder_m, color: "#9b59b6" },
                      { label: "Cable Segment", val: effectiveDistances.capacity_segment_m, color: "#e67e22" },
                    ].map((d) => (
                      <div key={d.label} className="flex items-center justify-between text-sm rounded-md border bg-muted/20 px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-muted-foreground">{d.label}</span>
                        </span>
                        <span className="font-semibold">{d.val.toLocaleString()}m</span>
                      </div>
                    ))}
                  </div>
                ) : result.distance_bands ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Primary Substation</span><Badge variant="outline">{result.distance_bands.primary}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Feeder</span><Badge variant="outline">{result.distance_bands.feeder}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Cable Segment</span><Badge variant="outline">{result.distance_bands.capacity_segment}</Badge></div>
                  </div>
                ) : null}
              </div>

              {/* Constraints */}
              {isInternal && result.constraints && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Local & Upstream Constraints</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">NDP Intersect</span><Badge variant={result.constraints.ndp_intersect ? "destructive" : "outline"}>{result.constraints.ndp_intersect ? "Yes" : "No"}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">NDP within 1km</span><Badge variant={result.constraints.ndp_within_1000m ? "secondary" : "outline"}>{result.constraints.ndp_within_1000m ? "Yes" : "No"}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Wayleave</span><Badge variant={result.constraints.wayleave_intersect ? "destructive" : "outline"}>{result.constraints.wayleave_intersect ? "Yes" : "No"}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Capacity</span><Badge variant="outline">{result.constraints.capacity_flag}</Badge></div>
                    {result.constraints.min_footway_m !== null && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Min Footway</span><span className="font-medium">{result.constraints.min_footway_m}m</span></div>
                    )}
                    {result.constraints.min_carriageway_m !== null && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Min Carriageway</span><span className="font-medium">{result.constraints.min_carriageway_m}m</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Network Visibility - nearby substations with gauges */}
              {isInternal && lng && lat && (
                <>
                  <Separator />
                  <NetworkVisibilityPanel lng={lng} lat={lat} />
                </>
              )}

              {/* Connection Cost Estimate */}
              {effectiveDistances && pkw > 0 && (
                <>
                  <Separator />
                  <CostEstimatePanel
                    voltageOverride="Auto"
                    proposed_kw={pkw}
                    distances={effectiveDistances}
                    constraints={result.constraints}
                    includeFeederPillar={includeFeederPillar}
                  />
                </>
              )}

              {/* Reasons */}
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

              {/* Export & Save */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    let locationScreenshot: string | null = null;
                    let routeScreenshot: string | null = null;
                    if (onCaptureMapScreenshot) {
                      try {
                        const shots = await onCaptureMapScreenshot();
                        locationScreenshot = shots.location;
                        routeScreenshot = shots.route;
                      } catch {}
                    }
                    generateAssessmentPdf({
                      siteName: siteName || undefined,
                      postcode: postcode || undefined,
                      proposedKw: pkw,
                      lat: lat ?? undefined,
                      lng: lng ?? undefined,
                      score: result.score,
                      reasons: result.reasons,
                      nextSteps: result.next_steps,
                      distances: effectiveDistances ?? result.distances,
                      distanceBands: result.distance_bands,
                      constraints: result.constraints,
                      unitRates,
                      locationMapScreenshot: locationScreenshot || routeScreenshot,
                    });
                  }}
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
