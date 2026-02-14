import { useState } from "react";
import { Layers, ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export interface LayerConfig {
  id: string;
  label: string;
  color: string;
  group: string;
  visible: boolean;
}

const DEFAULT_LAYERS: LayerConfig[] = [
  { id: "primary_substations", label: "Primary Substations (33/66kV)", color: "#e74c3c", group: "Substations", visible: false },
  { id: "ehv_feeders", label: "EHV Feeders", color: "#9b59b6", group: "Feeders", visible: false },
  { id: "hv_feeders", label: "HV Feeders (33kV & 66kV)", color: "#3498db", group: "Feeders", visible: false },
  { id: "underground_cables", label: "HV/EHV Underground Cables", color: "#e67e22", group: "Cables", visible: false },
  { id: "ndp", label: "Network Development Plans", color: "#2ecc71", group: "Planning", visible: false },
  { id: "highway_widths", label: "Footway / Carriageway Widths", color: "#95a5a6", group: "Constraints", visible: false },
  { id: "wayleaves", label: "Wayleaves", color: "#f1c40f", group: "Constraints", visible: false },
];

interface LayerTogglePanelProps {
  layers: LayerConfig[];
  onToggle: (layerId: string, visible: boolean) => void;
}

export function LayerTogglePanel({ layers, onToggle }: LayerTogglePanelProps) {
  const [expanded, setExpanded] = useState(true);

  const groups = layers.reduce<Record<string, LayerConfig[]>>((acc, layer) => {
    if (!acc[layer.group]) acc[layer.group] = [];
    acc[layer.group].push(layer);
    return acc;
  }, {});

  return (
    <div className="absolute top-3 right-14 z-10 w-72">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="h-4 w-4 text-primary" />
            NPG Layers
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {expanded && (
          <div className="border-t px-3 py-2 space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(groups).map(([group, groupLayers]) => (
              <div key={group} className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
                {groupLayers.map((layer) => (
                  <div key={layer.id} className="flex items-center justify-between gap-2 py-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-3 w-3 rounded-sm shrink-0 border border-border"
                        style={{ backgroundColor: layer.color }}
                      />
                      <Label htmlFor={`layer-${layer.id}`} className="text-xs font-normal truncate cursor-pointer">
                        {layer.label}
                      </Label>
                    </div>
                    <Switch
                      id={`layer-${layer.id}`}
                      checked={layer.visible}
                      onCheckedChange={(checked) => onToggle(layer.id, checked)}
                      className="scale-75"
                    />
                  </div>
                ))}
              </div>
            ))}
            <div className="pt-1 border-t">
              <p className="text-[10px] text-muted-foreground">
                Toggle layers to load spatial data from the database. Click features for details.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_LAYERS };
