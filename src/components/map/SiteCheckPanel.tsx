import { useState } from "react";
import { X, MapPin, Zap, AlertTriangle, CheckCircle, XCircle, Save, Loader2, Search, ClipboardCheck, FolderOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useUnitRates } from "@/hooks/useUnitRates";

interface SiteCheckPanelProps {
  lng: number | null;
  lat: number | null;
  onClose: () => void;
  onSaved?: () => void;
  onConnectionLines?: (lines: ConnectionLine[]) => void;
  onCaptureMapScreenshot?: () => Promise<string | null>;
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
  nearest_points?: { primary?: [number, number]; feeder?: [number, number]; cable?: [number, number] };
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
  const [result, setResult] = useState<ScoreResult | null>(null);

  const currentStep = saved ? 3 : result ? 2 : 1;

  const handleScore = async () => {
    if (!lng || !lat) return;
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("score-site", {
        body: { lng, lat, proposed_kw: Number(proposedKw) || 0, site_name: siteName, postcode, site_type: siteType },
      });
      if (res.error) throw res.error;
      setResult(res.data);

      // Build connection lines if nearest_points are available
      if (res.data.nearest_points && onConnectionLines) {
        const lines: ConnectionLine[] = [];
        const origin: [number, number] = [lng, lat];
        if (res.data.nearest_points.primary) {
          lines.push({ id: "line-primary", label: "Primary Substation", coords: [origin, res.data.nearest_points.primary], color: "#e74c3c", distance_m: res.data.distances?.primary_m || 0 });
        }
        if (res.data.nearest_points.feeder) {
          lines.push({ id: "line-feeder", label: "Feeder", coords: [origin, res.data.nearest_points.feeder], color: "#9b59b6", distance_m: res.data.distances?.feeder_m || 0 });
        }
        if (res.data.nearest_points.cable) {
          lines.push({ id: "line-cable", label: "Cable", coords: [origin, res.data.nearest_points.cable], color: "#e67e22", distance_m: res.data.distances?.capacity_segment_m || 0 });
        }
        onConnectionLines(lines);
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
        proposed_kw: Number(proposedKw) || null,
        site_type: siteType,
        score: result.score,
        score_reasons: result.reasons,
        connection_options: result.distances || result.distance_bands || [],
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
                {isInternal && result.distances ? (
                  <div className="space-y-1.5">
                    {[
                      { label: "Primary Substation", val: result.distances.primary_m, color: "#e74c3c" },
                      { label: "Feeder", val: result.distances.feeder_m, color: "#9b59b6" },
                      { label: "Cable Segment", val: result.distances.capacity_segment_m, color: "#e67e22" },
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
              {result.distances && Number(proposedKw) > 0 && (
                <>
                  <Separator />
                  <CostEstimatePanel
                    voltageOverride="Auto"
                    proposed_kw={Number(proposedKw)}
                    distances={result.distances}
                    constraints={result.constraints}
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
                    if (onCaptureMapScreenshot) {
                      try { locationScreenshot = await onCaptureMapScreenshot(); } catch {}
                    }
                    generateAssessmentPdf({
                      siteName: siteName || undefined,
                      postcode: postcode || undefined,
                      proposedKw: Number(proposedKw) || 0,
                      lat: lat ?? undefined,
                      lng: lng ?? undefined,
                      score: result.score,
                      reasons: result.reasons,
                      nextSteps: result.next_steps,
                      distances: result.distances,
                      distanceBands: result.distance_bands,
                      constraints: result.constraints,
                      unitRates,
                      locationMapScreenshot: locationScreenshot,
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
