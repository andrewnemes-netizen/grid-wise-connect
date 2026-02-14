import type { LayerConfig } from "./LayerTogglePanel";

interface MapLegendProps {
  layers: LayerConfig[];
  heatmapMode?: boolean;
}

const UTILISATION_BANDS = [
  { label: "Low", color: "#22c55e" },
  { label: "Below Average", color: "#84cc16" },
  { label: "Average", color: "#f59e0b" },
  { label: "Above Average", color: "#f97316" },
  { label: "High", color: "#ef4444" },
];

export function MapLegend({ layers, heatmapMode }: MapLegendProps) {
  const visibleLayers = layers.filter((l) => l.visible);
  if (visibleLayers.length === 0) return null;

  const showUtilisationBands = visibleLayers.some((l) => l.id === "site_utilisation");

  return (
    <div className="absolute bottom-4 right-3 z-10">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-md px-3 py-2 space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Legend</span>

        {showUtilisationBands && !heatmapMode && (
          <div className="space-y-0.5 pb-1 border-b border-border">
            <span className="text-[10px] text-muted-foreground">Utilisation Band</span>
            {UTILISATION_BANDS.map((band) => (
              <div key={band.label} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full border border-border" style={{ backgroundColor: band.color }} />
                <span className="text-[11px] text-foreground">{band.label}</span>
              </div>
            ))}
          </div>
        )}

        {showUtilisationBands && heatmapMode && (
          <div className="space-y-0.5 pb-1 border-b border-border">
            <span className="text-[10px] text-muted-foreground">Utilisation Heatmap</span>
            <div
              className="h-3 w-full rounded-sm"
              style={{
                background: "linear-gradient(90deg, #22c55e 0%, #84cc16 25%, #f59e0b 50%, #f97316 75%, #ef4444 100%)",
              }}
            />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        )}

        {visibleLayers
          .filter((l) => l.id !== "site_utilisation")
          .map((layer) => (
            <div key={layer.id} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-sm border border-border" style={{ backgroundColor: layer.color }} />
              <span className="text-[11px] text-foreground">{layer.label}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
