import type { LayerConfig } from "./LayerTogglePanel";

interface MapLegendProps {
  layers: LayerConfig[];
}

export function MapLegend({ layers }: MapLegendProps) {
  const visibleLayers = layers.filter((l) => l.visible);
  if (visibleLayers.length === 0) return null;

  return (
    <div className="absolute bottom-4 right-3 z-10">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-md px-3 py-2 space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Legend</span>
        {visibleLayers.map((layer) => (
          <div key={layer.id} className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-sm border border-border"
              style={{ backgroundColor: layer.color }}
            />
            <span className="text-[11px] text-foreground">{layer.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
