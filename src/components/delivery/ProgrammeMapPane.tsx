import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Briefcase, MapPin } from "lucide-react";

/**
 * Left-pane visual: an embedded MapLibre canvas as ambient context,
 * layered with a translucent panel listing the programme's work packages / sites.
 * Coordinates are stored as PostGIS geoms elsewhere — this pane is intentionally
 * a light overview, not the live analytics map. Click "Open in Map" to jump.
 */
export function ProgrammeMapPane({
  title,
  subtitle,
  items,
  emptyLabel = "No items yet",
  onOpenMap,
}: {
  title: string;
  subtitle?: string;
  items: { id: string; label: string; sub?: string; badge?: string }[];
  emptyLabel?: string;
  onOpenMap?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [-2.2, 53.5],
      zoom: 5.4,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="absolute inset-0" />
      {/* Emerald overlay tint */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-deep/25 via-transparent to-background/40" />

      {/* Header card */}
      <div className="absolute left-3 right-3 top-3 rounded-lg border border-border/60 bg-card/95 backdrop-blur px-3 py-2.5 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold tracking-tight truncate">{title}</div>
            {subtitle && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitle}</div>}
          </div>
          {onOpenMap && (
            <button
              onClick={onOpenMap}
              className="shrink-0 rounded border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/70 hover:text-accent hover:border-accent/60"
            >
              Open map
            </button>
          )}
        </div>
      </div>

      {/* Items panel */}
      <div className="absolute left-3 right-3 bottom-3 rounded-lg border border-border/60 bg-card/95 backdrop-blur shadow-panel overflow-hidden max-h-[55%] flex flex-col">
        <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">In this programme</span>
          <span className="ml-auto rounded-full bg-accent/20 text-accent-foreground px-1.5 py-0.5 text-[10px] font-semibold">{items.length}</span>
        </div>
        <div className="overflow-auto scrollbar-none divide-y divide-border/50">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</div>
          ) : items.map((it) => (
            <div key={it.id} className="px-3 py-2 flex items-center gap-2 hover:bg-muted/40 transition-colors">
              <MapPin className="h-3.5 w-3.5 text-primary/70 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{it.label}</div>
                {it.sub && <div className="text-[10px] text-muted-foreground truncate">{it.sub}</div>}
              </div>
              {it.badge && (
                <span className="text-[10px] font-semibold text-accent-foreground bg-accent/25 rounded px-1.5 py-0.5 uppercase tracking-wide">{it.badge}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}