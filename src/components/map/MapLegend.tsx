import type { RegistryLayer, LayerVisibility } from "./LayerTogglePanel";
import { getLayerColor } from "./LayerTogglePanel";

interface MapLegendProps {
  registryLayers: RegistryLayer[];
  visibility: LayerVisibility;
  heatmapMode?: boolean;
}

const UTILISATION_BANDS = [
  { label: "Low", color: "#22c55e" },
  { label: "Below Average", color: "#84cc16" },
  { label: "Average", color: "#f59e0b" },
  { label: "Above Average", color: "#f97316" },
  { label: "High", color: "#ef4444" },
];

export function MapLegend({ registryLayers, visibility, heatmapMode }: MapLegendProps) {
  const visibleLayers = registryLayers.filter((l) => visibility[l.id]);
  if (visibleLayers.length === 0) return null;

  const showUtilBands = visibleLayers.some((l) => l.slug === "npg_hv_substations_utilisation");

  return (
    <div className="absolute bottom-4 right-3 z-10">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-md px-3 py-2 space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Legend</span>

        {showUtilBands && !heatmapMode && (
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

        {showUtilBands && heatmapMode && (
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
          .filter((l) => l.slug !== "npg_hv_substations_utilisation")
          .map((layer, idx) => (
            <div key={layer.id} className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-sm border border-border"
                style={{ backgroundColor: getLayerColor(layer, idx) }}
              />
              <span className="text-[11px] text-foreground">{layer.display_name}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
