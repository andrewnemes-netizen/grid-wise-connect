import { MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MapToolbarProps {
  activeTool: "pin" | null;
  onToolChange: (tool: "pin" | null) => void;
  onClear: () => void;
}

export function MapToolbar({ activeTool, onToolChange, onClear }: MapToolbarProps) {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={activeTool === "pin" ? "default" : "outline"}
            className="h-9 w-9 shadow-md bg-background/95 backdrop-blur"
            onClick={() => onToolChange(activeTool === "pin" ? null : "pin")}
          >
            <MapPin className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Drop Pin</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 shadow-md bg-background/95 backdrop-blur"
            onClick={onClear}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Clear</TooltipContent>
      </Tooltip>
    </div>
  );
}
