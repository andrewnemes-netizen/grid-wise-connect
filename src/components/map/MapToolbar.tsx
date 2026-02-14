import { MapPin, Trash2, Ruler, ZoomIn, Compass, Pentagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MapToolbarProps {
  activeTool: "pin" | "measure" | "polygon" | null;
  onToolChange: (tool: "pin" | "measure" | "polygon" | null) => void;
  onClear: () => void;
  onZoomToUK?: () => void;
}

const tools = [
  { id: "pin" as const, icon: MapPin, label: "Drop Pin — assess a location" },
  { id: "polygon" as const, icon: Pentagon, label: "Draw polygon — search substations in area" },
  { id: "measure" as const, icon: Ruler, label: "Measure distance" },
] as const;

export function MapToolbar({ activeTool, onToolChange, onClear, onZoomToUK }: MapToolbarProps) {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
      {tools.map((tool) => (
        <Tooltip key={tool.id}>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={activeTool === tool.id ? "default" : "outline"}
              className="h-9 w-9 shadow-md bg-background/95 backdrop-blur"
              onClick={() => onToolChange(activeTool === tool.id ? null : tool.id)}
            >
              <tool.icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{tool.label}</TooltipContent>
        </Tooltip>
      ))}

      <div className="h-px bg-border my-0.5" />

      {onZoomToUK && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" className="h-9 w-9 shadow-md bg-background/95 backdrop-blur" onClick={onZoomToUK}>
              <Compass className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Reset view</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="outline" className="h-9 w-9 shadow-md bg-background/95 backdrop-blur" onClick={onClear}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Clear all</TooltipContent>
      </Tooltip>
    </div>
  );
}
