import { useState, useCallback } from "react";
import { MapPin, Zap, Loader2, CheckCircle, AlertTriangle, XCircle, PoundSterling, ArrowRight, RotateCcw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { estimateConnectionCost, type CostEstimate } from "@/lib/connectionCosts";
import { generateAssessmentPdf } from "@/lib/generateAssessmentPdf";
import epeLogo from "@/assets/epe-logo.png";

interface QuickResult {
  score: string;
  reasons: string[];
  next_steps: string[];
  distances?: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  distance_bands?: { primary: string; feeder: string; capacity_segment: string };
  capacity_indicator?: string;
}

const scoreConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string; desc: string }> = {
  GREEN: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Viable", desc: "Good connectivity — straightforward connection likely" },
  AMBER: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Possible", desc: "Connection possible but may require reinforcement" },
  RED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Challenging", desc: "Significant constraints — specialist review recommended" },
};

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(amount);
}

export default function QuickEstimate() {
  const { toast } = useToast();
  const [postcode, setPostcode] = useState("");
  const [proposedKw, setProposedKw] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickResult | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!postcode.trim()) {
      toast({ title: "Please enter a postcode", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    setCostEstimate(null);

    try {
      // Geocode postcode
      const geoRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
      const geoData = await geoRes.json();
      if (geoData.status !== 200) throw new Error("Invalid postcode");

      const lng = geoData.result.longitude;
      const lat = geoData.result.latitude;
      setCoords({ lng, lat });

      // Score site
      const { data, error } = await supabase.functions.invoke("score-site", {
        body: { lng, lat, proposed_kw: Number(proposedKw) || 0, postcode: postcode.trim() },
      });
      if (error) throw error;
      setResult(data);

      // Calculate cost estimate if we have distances
      if (data.distances && Number(proposedKw) > 0) {
        const estimate = estimateConnectionCost({
          proposed_kw: Number(proposedKw),
          distances: data.distances,
          constraints: data.constraints,
        });
        setCostEstimate(estimate);
      }
    } catch (err: any) {
      toast({ title: "Assessment failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [postcode, proposedKw, toast]);

  const handleReset = () => {
    setPostcode("");
    setProposedKw("");
    setResult(null);
    setCostEstimate(null);
    setCoords(null);
  };

  const sc = result ? scoreConfig[result.score] || scoreConfig.AMBER : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={epeLogo} alt="EcoPower" className="h-8" />
            <div>
              <h1 className="text-lg font-bold text-foreground">Quick Connection Estimate</h1>
              <p className="text-xs text-muted-foreground">Instant EV charging connection viability & budget</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {!result ? (
          /* Input form */
          <Card className="border-2">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-xl">Check Your Connection</CardTitle>
              <CardDescription>
                Enter your postcode and proposed load to get an instant viability assessment and budget estimate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Site Postcode</Label>
                <Input
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                  placeholder="e.g. NE1 4LP"
                  className="text-lg h-12 text-center tracking-wider"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
              <div className="space-y-2">
                <Label>Proposed Load (kW)</Label>
                <Input
                  type="number"
                  value={proposedKw}
                  onChange={(e) => setProposedKw(e.target.value)}
                  placeholder="e.g. 250"
                  className="text-lg h-12 text-center"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
                <p className="text-xs text-muted-foreground">Typical: 50kW (fast charger), 150kW (rapid), 350kW (ultra-rapid)</p>
              </div>
              <Button onClick={handleSubmit} disabled={loading} className="w-full h-12 text-base" size="lg">
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Assessing…</>
                ) : (
                  <><MapPin className="mr-2 h-5 w-5" /> Get Instant Assessment</>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Results */
          <div className="space-y-6">
            {/* Score card */}
            {sc && (
              <Card className={`border-2 ${sc.bg}`}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${sc.bg}`}>
                      <sc.icon className={`h-8 w-8 ${sc.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${sc.color}`}>{result.score}</span>
                        <Badge variant="outline" className={sc.color}>{sc.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{sc.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Location info */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Postcode</span>
                  <span className="font-semibold">{postcode}</span>
                </div>
                {Number(proposedKw) > 0 && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Proposed Load</span>
                    <span className="font-semibold">{proposedKw} kW</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Connection proximity */}
            {result.distance_bands && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Connection Proximity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: "Primary Substation", band: result.distance_bands.primary },
                    { label: "Feeder", band: result.distance_bands.feeder },
                    { label: "Cable Segment", band: result.distance_bands.capacity_segment },
                  ].map((d) => (
                    <div key={d.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{d.label}</span>
                      <Badge variant="outline">{d.band}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Cost estimate */}
            {costEstimate && (
              <Card className="border-2 border-primary/20">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <PoundSterling className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">Budget Estimate</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <p className="text-3xl font-bold text-foreground">{formatGBP(costEstimate.total_estimate)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Indicative budget estimate (exc. VAT)</p>
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cable & installation</span>
                      <span>{formatGBP(costEstimate.cable_cost + costEstimate.excavation_cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Equipment</span>
                      <span>{formatGBP(costEstimate.equipment_cost)}</span>
                    </div>
                    {costEstimate.reinforcement_cost > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reinforcement</span>
                        <span>{formatGBP(costEstimate.reinforcement_cost)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fees & contingency</span>
                      <span>{formatGBP(costEstimate.design_fee + costEstimate.project_management + costEstimate.contingency)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reasons */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Key Findings</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {result.reasons.map((r, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Next steps */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recommended Next Steps</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {result.next_steps.map((s, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Disclaimer & CTA */}
            <div className="text-center space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                This is an indicative assessment using UK industry-standard rates. For a formal quotation, contact our team or speak with your DNO directly.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="default"
                  onClick={() => generateAssessmentPdf({
                    postcode: postcode || undefined,
                    proposedKw: Number(proposedKw) || 0,
                    lat: coords?.lat,
                    lng: coords?.lng,
                    score: result.score,
                    reasons: result.reasons,
                    nextSteps: result.next_steps,
                    distances: result.distances,
                    distanceBands: result.distance_bands,
                  })}
                >
                  <Download className="mr-2 h-4 w-4" /> Download Report
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="mr-2 h-4 w-4" /> New Assessment
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}