import { useState, useMemo, useEffect } from "react";
import { X, Cable, Zap, Loader2, AlertTriangle, CheckCircle, XCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CostEstimatePanel } from "./CostEstimatePanel";
import { generateAssessmentPdf } from "@/lib/generateAssessmentPdf";

export interface ConnectEndpoints {
  source: {
    lngLat: [number, number];
    properties: Record<string, unknown>;
    layerLabel: string;
  };
  destination: {
    lngLat: [number, number];
  };
  routeCoords: [number, number][]; // All points: source → waypoints → destination
}

interface ConnectAssessmentPanelProps {
  endpoints: ConnectEndpoints;
  onClose: () => void;
  onCaptureMapScreenshot?: () => Promise<string | null>;
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

export function ConnectAssessmentPanel({ endpoints, onClose, onCaptureMapScreenshot }: ConnectAssessmentPanelProps) {
  const { toast } = useToast();
  const [proposedKw, setProposedKw] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);

  // Calculate route distance (sum of all segments)
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

  // Auto-run feasibility from the destination point
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
  const distances = useMemo(() => {
    if (result?.distances) {
      return {
        ...result.distances,
        primary_m: Math.min(result.distances.primary_m, routeDistanceM),
        feeder_m: Math.min(result.distances.feeder_m, routeDistanceM),
        capacity_segment_m: Math.min(result.distances.capacity_segment_m, routeDistanceM),
      };
    }
    return { primary_m: routeDistanceM, feeder_m: routeDistanceM, capacity_segment_m: routeDistanceM };
  }, [result, routeDistanceM]);

  const sc = result ? scoreConfig[result.score] || scoreConfig.AMBER : null;

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

              {/* Export */}
              <Button
                variant="outline"
                className="w-full"
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
                  });
                }}
              >
                <Download className="mr-2 h-4 w-4" />Export PDF
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
