import { useState } from "react";
import { X, MapPin, Zap, AlertTriangle, CheckCircle, XCircle, Save, Loader2 } from "lucide-react";
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

interface SiteCheckPanelProps {
  lng: number | null;
  lat: number | null;
  onClose: () => void;
  onSaved?: () => void;
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
}

const SITE_TYPES = [
  { value: "depot", label: "Depot" },
  { value: "workplace", label: "Workplace" },
  { value: "public", label: "Public" },
  { value: "fleet", label: "Fleet" },
  { value: "other", label: "Other" },
];

const scoreConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  GREEN: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  AMBER: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  RED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

export function SiteCheckPanel({ lng, lat, onClose, onSaved }: SiteCheckPanelProps) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isInternal = hasRole("admin") || hasRole("engineer");

  const [siteName, setSiteName] = useState("");
  const [postcode, setPostcode] = useState("");
  const [proposedKw, setProposedKw] = useState("");
  const [siteType, setSiteType] = useState("other");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);

  const handleScore = async () => {
    if (!lng || !lat) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("score-site", {
        body: { lng, lat, proposed_kw: Number(proposedKw) || 0, site_name: siteName, postcode, site_type: siteType },
      });
      if (res.error) throw res.error;
      setResult(res.data);
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
      toast({ title: "Site saved" });
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
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Site Check</span>
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
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running Check…</> : <><Zap className="mr-2 h-4 w-4" />Run Feasibility Check</>}
          </Button>

          {/* Results */}
          {result && sc && (
            <>
              <Separator />
              <div className={`rounded-lg border p-4 ${sc.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <sc.icon className={`h-5 w-5 ${sc.color}`} />
                  <span className={`text-lg font-bold ${sc.color}`}>{result.score}</span>
                </div>
              </div>

              {/* Distances / Bands */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connection Proximity</p>
                {isInternal && result.distances ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Primary Substation</span><span className="font-medium">{result.distances.primary_m}m</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Feeder</span><span className="font-medium">{result.distances.feeder_m}m</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Capacity Segment</span><span className="font-medium">{result.distances.capacity_segment_m}m</span></div>
                  </div>
                ) : result.distance_bands ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Primary Substation</span><Badge variant="outline">{result.distance_bands.primary}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Feeder</span><Badge variant="outline">{result.distance_bands.feeder}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Capacity Segment</span><Badge variant="outline">{result.distance_bands.capacity_segment}</Badge></div>
                  </div>
                ) : null}
              </div>

              {/* Constraints */}
              {isInternal && result.constraints && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Constraints</p>
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

              {/* Reasons */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reasons</p>
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Next Steps</p>
                <ul className="space-y-1">
                  {result.next_steps.map((s, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Save */}
              <Button onClick={handleSave} disabled={saving} variant="outline" className="w-full">
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save as Site</>}
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
