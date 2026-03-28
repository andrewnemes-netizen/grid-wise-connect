import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, CheckCircle, AlertTriangle, XCircle, MapPin, Download,
  TrafficCone, Bus, Zap, ShieldAlert, BatteryCharging, Cable, PoundSterling,
} from "lucide-react";
import { generateAssessmentPdf } from "@/lib/generateAssessmentPdf";
import { useUnitRates } from "@/hooks/useUnitRates";
import { useToast } from "@/hooks/use-toast";

const scoreConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  GREEN: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  AMBER: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  RED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

const SiteDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const { data: unitRates } = useUnitRates();
  const isInternal = hasRole("admin") || hasRole("engineer");

  const { data: site, isLoading } = useQuery({
    queryKey: ["site", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["site-notes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_notes")
        .select("*")
        .eq("site_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>;
  if (!site) return <div className="flex h-full items-center justify-center text-muted-foreground">Site not found</div>;

  const raw = (site.raw_score_data || {}) as any;
  const sc = scoreConfig[site.score || "AMBER"] || scoreConfig.AMBER;
  const reasons = (site.score_reasons as string[]) || [];
  const nextSteps = (site.next_steps as string[]) || [];

  // Extract enrichment data from raw_score_data
  const trafficAadf = raw.traffic_aadf || 0;
  const busStops = raw.nearby_bus_stops || 0;
  const railStations = raw.nearby_rail_stations || 0;
  const safetyIncidents = raw.safety_incidents || raw.safetyIncidents || 0;
  const aiNarrative = raw.ai_safety_narrative || raw.aiSafetyNarrative || null;
  const masterScore = raw.master_score || raw.masterScore || null;
  const masterVerdict = raw.master_verdict || raw.masterVerdict || null;
  const gridViabilityIndex = raw.grid_viability_index || raw.gridViabilityIndex || null;
  const deploymentClass = raw.deployment_class || raw.deploymentClass || null;
  const gridReadiness = raw.grid_readiness || raw.gridReadiness || null;
  const recommendedScale = raw.recommended_scale || raw.recommendedScale || null;
  const recommendedVoltage = raw.recommended_voltage || raw.recommendedVoltage || null;
  const bestPoc = raw.best_poc || raw.bestPoc || null;
  const feederConstraintRisk = raw.feeder_constraint_risk || raw.feederConstraintRisk || null;
  const reinforcementProb = raw.reinforcement_probability ?? site.reinforcement_probability ?? null;
  const costBand = raw.cost_band || site.cost_band || null;
  const nearestSubstations = raw.nearest_substations || raw.nearestSubstations || [];
  const distances = raw.distances || null;
  const constraints = raw.constraints || null;
  const connectionOptions = (site.connection_options || raw.connection_options) as any;

  const trafficLabel = trafficAadf > 25000 ? "HIGH" : trafficAadf > 8000 ? "MEDIUM" : trafficAadf > 0 ? "LOW" : "NO DATA";
  const accessibilityLabel = (busStops + railStations) > 0 ? `${busStops} bus, ${railStations} rail` : "NO DATA";
  const safetyLabel = safetyIncidents === 0 ? "LOW RISK" : safetyIncidents <= 5 ? "MEDIUM" : "HIGH RISK";
  const gridLabel = gridViabilityIndex ? `${gridViabilityIndex}/100` : (site.score || "—");

  const handleExportPdf = async () => {
    try {
      await generateAssessmentPdf({
        siteName: site.site_name,
        postcode: site.postcode || undefined,
        proposedKw: site.proposed_kw || 0,
        score: site.score || "AMBER",
        reasons,
        nextSteps,
        distances,
        constraints,
        masterScore,
        masterVerdict,
        trafficAadf,
        trafficLabel,
        nearbyBusStops: busStops,
        nearbyRailStations: railStations,
        accessibilityLabel,
        gridViabilityIndex,
        safetyIncidents,
        safetyLabel,
        aiSafetyNarrative: aiNarrative,
        deploymentClass,
        gridReadiness,
        recommendedScale,
        recommendedVoltage,
        bestPoc,
        feederConstraintRisk,
        reinforcementProbability: reinforcementProb,
        costBand,
        nearestSubstations,
        unitRates: unitRates || undefined,
        skipSave: true,
      });
      toast({ title: "PDF exported" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6 h-full overflow-auto max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portfolio")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">{site.site_name}</h2>
          <p className="text-sm text-muted-foreground">{site.postcode || "No postcode"} · {site.site_type || "—"}</p>
        </div>
        {site.score && (
          <div className={`rounded-lg border px-3 py-1.5 flex items-center gap-2 ${sc.bg}`}>
            <sc.icon className={`h-4 w-4 ${sc.color}`} />
            <span className={`font-bold ${sc.color}`}>{site.score}</span>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5">
          <Download className="h-4 w-4" /> Export PDF
        </Button>
      </div>

      {/* Master Score Banner */}
      {masterScore != null && (
        <Card className={masterVerdict === "INSTALL" ? "border-emerald-300 bg-emerald-50" : masterVerdict === "AVOID" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}>
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{masterScore}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
              <p className="text-sm text-muted-foreground">Combined Site Score</p>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-1">{masterVerdict}</Badge>
          </CardContent>
        </Card>
      )}

      {/* Score Breakdown Pillars */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-3 text-center space-y-1">
            <TrafficCone className="h-5 w-5 mx-auto text-amber-600" />
            <p className="text-xs text-muted-foreground">Traffic Demand</p>
            <p className="font-bold text-sm">{trafficAadf > 0 ? trafficAadf.toLocaleString() + " AADF" : "No data"}</p>
            <Badge variant="secondary" className="text-xs">{trafficLabel}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center space-y-1">
            <Bus className="h-5 w-5 mx-auto text-blue-600" />
            <p className="text-xs text-muted-foreground">Accessibility</p>
            <p className="font-bold text-sm">{accessibilityLabel}</p>
            <Badge variant="secondary" className="text-xs">{(busStops + railStations) > 0 ? "AVAILABLE" : "NO DATA"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center space-y-1">
            <Zap className="h-5 w-5 mx-auto text-emerald-600" />
            <p className="text-xs text-muted-foreground">Grid Feasibility</p>
            <p className="font-bold text-sm">{gridLabel}</p>
            <Badge variant="secondary" className="text-xs">{site.score || "—"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center space-y-1">
            <ShieldAlert className="h-5 w-5 mx-auto text-red-600" />
            <p className="text-xs text-muted-foreground">Safety</p>
            <p className="font-bold text-sm">{safetyIncidents} incidents</p>
            <Badge variant="secondary" className="text-xs">{safetyLabel}</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Details + Reasons */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="secondary" className="capitalize">{site.status}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Proposed kW</span><span>{site.proposed_kw || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Client Org</span><span>{site.client_org || "—"}</span></div>
            {deploymentClass && <div className="flex justify-between"><span className="text-muted-foreground">Deployment Class</span><span>{deploymentClass}</span></div>}
            {gridReadiness && <div className="flex justify-between"><span className="text-muted-foreground">Grid Readiness</span><span>{gridReadiness}</span></div>}
            {recommendedScale && <div className="flex justify-between"><span className="text-muted-foreground">Recommended Scale</span><span>{recommendedScale}</span></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ICP Connection Strategy</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {bestPoc && <div className="flex justify-between"><span className="text-muted-foreground">Best POC</span><span className="text-right max-w-[180px] truncate">{bestPoc}</span></div>}
            {recommendedVoltage && <div className="flex justify-between"><span className="text-muted-foreground">Recommended Voltage</span><span>{recommendedVoltage}</span></div>}
            {feederConstraintRisk && <div className="flex justify-between"><span className="text-muted-foreground">Feeder Constraint Risk</span><span>{feederConstraintRisk}</span></div>}
            {reinforcementProb != null && <div className="flex justify-between"><span className="text-muted-foreground">Reinforcement Probability</span><span>{reinforcementProb}%</span></div>}
            {costBand && <div className="flex justify-between"><span className="text-muted-foreground">Cost Band</span><span>{costBand}</span></div>}
            {!bestPoc && !recommendedVoltage && <p className="text-xs text-muted-foreground">No connection strategy data</p>}
          </CardContent>
        </Card>
      </div>

      {/* Reasons + Next Steps */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Assessment Reasons</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {reasons.length === 0 ? (
                <li className="text-xs text-muted-foreground">No reasons recorded</li>
              ) : reasons.map((r, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Next Steps</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {nextSteps.length === 0 ? (
                <li className="text-xs text-muted-foreground">No next steps recorded</li>
              ) : nextSteps.map((s, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Nearest Substations */}
      {nearestSubstations.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Nearest Substations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nearestSubstations.map((sub: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs border rounded-md px-3 py-2">
                  <div>
                    <p className="font-medium">{sub.site_name}</p>
                    <p className="text-muted-foreground">{sub.site_id}</p>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p>Demand: {sub.max_demand_kw?.toFixed(1) || "—"} / {sub.firm_capacity_kw?.toFixed(0) || "—"} kW</p>
                    <p>Headroom: {sub.transformer_headroom_kw?.toFixed(0) || "—"} kW</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection Distances */}
      {distances && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Connection Distances</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Primary Substation</span><span>{distances.primary_m?.toFixed(0) || "—"}m</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Feeder</span><span>{distances.feeder_m?.toFixed(0) || "—"}m</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cable Segment</span><span>{distances.capacity_segment_m?.toFixed(0) || "—"}m</span></div>
          </CardContent>
        </Card>
      )}

      {/* Constraints */}
      {constraints && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Constraints Detected</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">NDP Intersect</span><span>{constraints.ndp_intersect ? "Yes" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">NDP within 1km</span><span>{constraints.ndp_within_1000m ? "Yes" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Wayleave</span><span>{constraints.wayleave_intersect ? "Yes" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Capacity</span><span>{constraints.capacity_flag || "unknown"}</span></div>
          </CardContent>
        </Card>
      )}

      {/* AI Safety Narrative */}
      {aiNarrative && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">AI Safety Assessment</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xs whitespace-pre-wrap leading-relaxed">{aiNarrative}</div>
          </CardContent>
        </Card>
      )}

      {/* Internal Notes */}
      {isInternal && notes.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {notes.map((n: any) => (
              <div key={n.id} className="text-xs border-l-2 border-primary/30 pl-3 py-1">
                <p>{n.note}</p>
                <p className="text-muted-foreground mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SiteDetail;
