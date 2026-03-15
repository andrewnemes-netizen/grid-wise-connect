import { useState } from "react";
import { MapPin, Trash2, Ruler, Compass, Pentagon, Cable, SquareDashedBottom, PencilRuler, Zap, Workflow, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

// Street View pegman icon (orange man like Google)
function StreetViewIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="6" r="3" />
      <ellipse cx="12" cy="15" rx="4" ry="5" />
      <circle cx="9" cy="5" r="0.8" fill="white" />
      <circle cx="15" cy="5" r="0.8" fill="white" />
      <circle cx="9" cy="5" r="0.3" fill="black" />
      <circle cx="15" cy="5" r="0.3" fill="black" />
    </svg>
  );
}

interface MapToolbarProps {
  activeTool: "pin" | "measure" | "polygon" | "connect" | "boundary" | "design" | "evhub" | "gridwise" | "analyse" | null;
  onToolChange: (tool: "pin" | "measure" | "polygon" | "connect" | "boundary" | "design" | "evhub" | "gridwise" | "analyse" | null) => void;
  onClear: () => void;
  onZoomToUK?: () => void;
  hasActiveStudy?: boolean;
}

const tools = [
  { id: "boundary" as const, icon: SquareDashedBottom, label: "Boundary" },
  { id: "pin" as const, icon: MapPin, label: "Drop Pin" },
  { id: "gridwise" as const, icon: Workflow, label: "Run Gridwise" },
  { id: "evhub" as const, icon: Zap, label: "EV Hub Feasibility" },
  { id: "connect" as const, icon: Cable, label: "Connect" },
  { id: "design" as const, icon: PencilRuler, label: "Design Mode", requiresStudy: true },
  { id: "analyse" as const, icon: Activity, label: "Analyse Design", requiresStudy: true },
  { id: "polygon" as const, icon: Pentagon, label: "Polygon Search" },
  { id: "measure" as const, icon: Ruler, label: "Measure" },
  // { id: "streetview" as const, customIcon: StreetViewIcon, label: "Street View" },
] as const;

export function MapToolbar({ activeTool, onToolChange, onClear, onZoomToUK, hasActiveStudy }: MapToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  return (
    <div className="absolute bottom-16 right-4 z-10 flex flex-col gap-1 items-end">
      {tools.map((tool) => {
        const disabled = 'requiresStudy' in tool && tool.requiresStudy && !hasActiveStudy;
        return (
          <div
            key={tool.id}
            className="flex items-center gap-1.5"
            onMouseEnter={() => setHoveredTool(tool.id)}
            onMouseLeave={() => setHoveredTool(null)}
          >
            {hoveredTool === tool.id && (
              <span className="text-xs font-medium bg-background/95 backdrop-blur border rounded-md px-2 py-1 shadow-md whitespace-nowrap">
                {tool.label}{disabled ? " (needs study)" : ""}
              </span>
            )}
            <Button
              size="icon"
              variant={activeTool === tool.id ? "default" : "outline"}
              className="h-9 w-9 shadow-md bg-background/95 backdrop-blur"
              disabled={disabled}
              onClick={() => onToolChange(activeTool === tool.id ? null : tool.id)}
            >
              <tool.icon className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <div className="h-px bg-border my-0.5 w-9" />

      {onZoomToUK && (
        <div
          className="flex items-center gap-1.5"
          onMouseEnter={() => setHoveredTool("uk")}
          onMouseLeave={() => setHoveredTool(null)}
        >
          {hoveredTool === "uk" && (
            <span className="text-xs font-medium bg-background/95 backdrop-blur border rounded-md px-2 py-1 shadow-md whitespace-nowrap">
              Reset view
            </span>
          )}
          <Button size="icon" variant="outline" className="h-9 w-9 shadow-md bg-background/95 backdrop-blur" onClick={onZoomToUK}>
            <Compass className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div
        className="flex items-center gap-1.5"
        onMouseEnter={() => setHoveredTool("clear")}
        onMouseLeave={() => setHoveredTool(null)}
      >
        {hoveredTool === "clear" && (
          <span className="text-xs font-medium bg-background/95 backdrop-blur border rounded-md px-2 py-1 shadow-md whitespace-nowrap">
            Clear all
          </span>
        )}
        <Button size="icon" variant="outline" className="h-9 w-9 shadow-md bg-background/95 backdrop-blur" onClick={onClear}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
