import { useState } from "react";
import { MapPin, Trash2, Ruler, Compass, Pentagon, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MapToolbarProps {
  activeTool: "pin" | "measure" | "polygon" | "connect" | null;
  onToolChange: (tool: "pin" | "measure" | "polygon" | "connect" | null) => void;
  onClear: () => void;
  onZoomToUK?: () => void;
}

const tools = [
  { id: "pin" as const, icon: MapPin, label: "Drop Pin" },
  { id: "connect" as const, icon: Cable, label: "Connect" },
  { id: "polygon" as const, icon: Pentagon, label: "Polygon Search" },
  { id: "measure" as const, icon: Ruler, label: "Measure" },
] as const;

export function MapToolbar({ activeTool, onToolChange, onClear, onZoomToUK }: MapToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 items-end">
      {tools.map((tool) => (
        <div
          key={tool.id}
          className="flex items-center gap-1.5"
          onMouseEnter={() => setHoveredTool(tool.id)}
          onMouseLeave={() => setHoveredTool(null)}
        >
          {hoveredTool === tool.id && (
            <span className="text-xs font-medium bg-background/95 backdrop-blur border rounded-md px-2 py-1 shadow-md whitespace-nowrap">
              {tool.label}
            </span>
          )}
          <Button
            size="icon"
            variant={activeTool === tool.id ? "default" : "outline"}
            className="h-9 w-9 shadow-md bg-background/95 backdrop-blur"
            onClick={() => onToolChange(activeTool === tool.id ? null : tool.id)}
          >
            <tool.icon className="h-4 w-4" />
          </Button>
        </div>
      ))}

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
