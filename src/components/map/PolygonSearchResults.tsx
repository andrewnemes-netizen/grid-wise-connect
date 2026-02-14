import { useEffect, useState } from "react";
import { X, Search, Loader2, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface PolygonSearchResultsProps {
  polygon: GeoJSON.Polygon;
  onClose: () => void;
}

interface SubstationResult {
  id: string;
  site_name: string;
  site_id: string;
  utilisation_pct: number | null;
  utilisation_band: string | null;
  firm_capacity_kw: number | null;
  max_demand_kw: number | null;
  transformer_headroom_kw: number | null;
  headroom_band: string | null;
  connected_customers: number | null;
  upstream_site: string | null;
}

const BAND_COLORS: Record<string, string> = {
  Low: "bg-green-100 text-green-800",
  "Below Average": "bg-lime-100 text-lime-800",
  Average: "bg-amber-100 text-amber-800",
  "Above Average": "bg-orange-100 text-orange-800",
  High: "bg-red-100 text-red-800",
};

export function PolygonSearchResults({ polygon, onClose }: PolygonSearchResultsProps) {
  const [results, setResults] = useState<SubstationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function search() {
      setLoading(true);
      setError(null);
      try {
        const geojson = JSON.stringify(polygon);
        const { data, error: rpcError } = await supabase.rpc("search_substations_in_polygon", {
          _geojson: geojson,
          _limit: 500,
        });
        if (rpcError) throw rpcError;
        setResults((data as SubstationResult[]) || []);
      } catch (err: any) {
        console.error("Polygon search failed:", err);
        setError(err.message || "Search failed");
      } finally {
        setLoading(false);
      }
    }
    search();
  }, [polygon]);

  // Summary stats
  const avgUtil = results.length
    ? Math.round(results.reduce((sum, r) => sum + (r.utilisation_pct ?? 0), 0) / results.length)
    : 0;
  const totalCapacity = results.reduce((sum, r) => sum + (r.firm_capacity_kw ?? 0), 0);
  const totalHeadroom = results.reduce((sum, r) => sum + (r.transformer_headroom_kw ?? 0), 0);

  return (
    <div className="absolute top-3 left-14 z-10 w-80 max-h-[calc(100%-2rem)]">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-6rem)]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4 text-primary" />
            Polygon Search
          </div>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching area…
          </div>
        )}

        {error && (
          <div className="px-3 py-4 text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && (
          <>
            {/* Summary */}
            <div className="px-3 py-2 border-b space-y-1.5">
              <div className="text-xs text-muted-foreground">
                Found <span className="font-semibold text-foreground">{results.length}</span> substations
              </div>
              {results.length > 0 && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-muted/50 px-1 py-1">
                    <div className="text-xs font-semibold text-foreground">{avgUtil}%</div>
                    <div className="text-[9px] text-muted-foreground">Avg Util</div>
                  </div>
                  <div className="rounded bg-muted/50 px-1 py-1">
                    <div className="text-xs font-semibold text-foreground">{(totalCapacity / 1000).toFixed(0)}</div>
                    <div className="text-[9px] text-muted-foreground">MW Cap</div>
                  </div>
                  <div className="rounded bg-muted/50 px-1 py-1">
                    <div className="text-xs font-semibold text-foreground">{(totalHeadroom / 1000).toFixed(0)}</div>
                    <div className="text-[9px] text-muted-foreground">MW Hdroom</div>
                  </div>
                </div>
              )}
            </div>

            {/* Results list */}
            <div className="overflow-y-auto flex-1">
              {results.length === 0 && (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  No substations found in this area.
                </div>
              )}
              {results.map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-accent/50 transition-colors"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{r.site_name}</div>
                      <div className="text-[10px] text-muted-foreground">{r.site_id}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.utilisation_band && (
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 ${BAND_COLORS[r.utilisation_band] || ""}`}>
                          {r.utilisation_band}
                        </Badge>
                      )}
                      {expanded === r.id ? (
                        <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {expanded === r.id && (
                    <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">Utilisation: </span>
                        <span className="font-medium">{r.utilisation_pct ?? "—"}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Capacity: </span>
                        <span className="font-medium">{r.firm_capacity_kw ?? "—"} kW</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Max Demand: </span>
                        <span className="font-medium">{r.max_demand_kw ?? "—"} kW</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Headroom: </span>
                        <span className="font-medium">{r.transformer_headroom_kw ?? "—"} kW</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Customers: </span>
                        <span className="font-medium">{r.connected_customers ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Upstream: </span>
                        <span className="font-medium truncate">{r.upstream_site ?? "—"}</span>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
