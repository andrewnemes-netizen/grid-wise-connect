import { useEffect, useState } from "react";
import { Activity, Gauge, Zap, TrendingUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface NetworkVisibilityPanelProps {
  lng: number;
  lat: number;
}

interface NearbySubstation {
  id: string;
  site_name: string;
  site_id: string;
  utilisation_pct: number | null;
  utilisation_band: string | null;
  firm_capacity_kw: number | null;
  max_demand_kw: number | null;
  transformer_headroom_kw: number | null;
  headroom_band: string | null;
}

const BAND_CONFIG: Record<string, { color: string; bg: string }> = {
  Low: { color: "text-emerald-700", bg: "bg-emerald-100" },
  "Below Average": { color: "text-lime-700", bg: "bg-lime-100" },
  Average: { color: "text-amber-700", bg: "bg-amber-100" },
  "Above Average": { color: "text-orange-700", bg: "bg-orange-100" },
  High: { color: "text-red-700", bg: "bg-red-100" },
};

function CapacityGauge({ label, value, max, unit, band }: { label: string; value: number; max: number; unit: string; band?: string | null }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const config = band ? BAND_CONFIG[band] : null;
  const barColor =
    pct < 40 ? "bg-emerald-500" :
    pct < 60 ? "bg-lime-500" :
    pct < 80 ? "bg-amber-500" :
    pct < 90 ? "bg-orange-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value.toLocaleString()} {unit}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{Math.round(pct)}% utilised</span>
        {band && config && (
          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${config.bg} ${config.color} border-0`}>
            {band}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function NetworkVisibilityPanel({ lng, lat }: NetworkVisibilityPanelProps) {
  const [substations, setSubstations] = useState<NearbySubstation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNearby() {
      setLoading(true);
      try {
        // Create a small polygon around the point (approx 2km radius)
        const offset = 0.02; // ~2km
        const polygon = {
          type: "Polygon" as const,
          coordinates: [[
            [lng - offset, lat - offset],
            [lng + offset, lat - offset],
            [lng + offset, lat + offset],
            [lng - offset, lat + offset],
            [lng - offset, lat - offset],
          ]],
        };
        const { data, error } = await supabase.rpc("search_substations_in_polygon", {
          _geojson: JSON.stringify(polygon),
          _limit: 10,
        });
        if (error) throw error;
        setSubstations((data as NearbySubstation[]) || []);
      } catch (err) {
        console.error("Network visibility fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchNearby();
  }, [lng, lat]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading network data…
      </div>
    );
  }

  if (substations.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        No substations found within 2km.
      </div>
    );
  }

  // Aggregate stats
  const avgUtil = Math.round(substations.reduce((s, r) => s + (r.utilisation_pct ?? 0), 0) / substations.length);
  const totalHeadroom = substations.reduce((s, r) => s + (r.transformer_headroom_kw ?? 0), 0);
  const totalCapacity = substations.reduce((s, r) => s + (r.firm_capacity_kw ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Network Visibility</p>
      </div>

      {/* Area summary gauges */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border bg-muted/30 p-2 text-center">
          <Gauge className="h-3.5 w-3.5 mx-auto text-primary mb-0.5" />
          <div className="text-sm font-bold">{avgUtil}%</div>
          <div className="text-[9px] text-muted-foreground">Avg Util</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-2 text-center">
          <Zap className="h-3.5 w-3.5 mx-auto text-amber-500 mb-0.5" />
          <div className="text-sm font-bold">{(totalCapacity / 1000).toFixed(1)}</div>
          <div className="text-[9px] text-muted-foreground">MW Cap</div>
        </div>
        <div className="rounded-md border bg-muted/30 p-2 text-center">
          <TrendingUp className="h-3.5 w-3.5 mx-auto text-emerald-500 mb-0.5" />
          <div className="text-sm font-bold">{(totalHeadroom / 1000).toFixed(1)}</div>
          <div className="text-[9px] text-muted-foreground">MW Hdroom</div>
        </div>
      </div>

      {/* Top 5 nearest substations with gauges */}
      <div className="space-y-2.5">
        {substations.slice(0, 5).map((sub) => (
          <div key={sub.id} className="rounded-md border bg-muted/10 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium truncate max-w-[60%]">{sub.site_name}</span>
              <span className="text-[9px] text-muted-foreground">{sub.site_id}</span>
            </div>
            {sub.firm_capacity_kw && sub.max_demand_kw !== null && (
              <CapacityGauge
                label="Demand / Capacity"
                value={sub.max_demand_kw ?? 0}
                max={sub.firm_capacity_kw}
                unit="kW"
                band={sub.utilisation_band}
              />
            )}
            {sub.transformer_headroom_kw !== null && sub.firm_capacity_kw && (
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Headroom</span>
                <span className="font-medium">{sub.transformer_headroom_kw?.toLocaleString()} kW</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {substations.length > 5 && (
        <p className="text-[9px] text-muted-foreground text-center">+ {substations.length - 5} more substations nearby</p>
      )}
    </div>
  );
}
