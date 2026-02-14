import { useState } from "react";
import { Map, Satellite, Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type BasemapId = "street" | "satellite" | "topo";

interface BasemapOption {
  id: BasemapId;
  icon: typeof Map;
  label: string;
}

const basemaps: BasemapOption[] = [
  { id: "street", icon: Map, label: "Street" },
  { id: "satellite", icon: Satellite, label: "Satellite" },
  { id: "topo", icon: Mountain, label: "Topographic" },
];

interface BasemapSwitcherProps {
  active: BasemapId;
  onChange: (id: BasemapId) => void;
}

export function BasemapSwitcher({ active, onChange }: BasemapSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-16 right-2.5 z-10 flex flex-col items-end gap-1">
      <Tooltip delayDuration={2000}>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 shadow-md bg-background/95 backdrop-blur"
            onClick={() => setOpen((o) => !o)}
          >
            {(() => {
              const ActiveIcon = basemaps.find((b) => b.id === active)?.icon || Map;
              return <ActiveIcon className="h-4 w-4" />;
            })()}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Base map</TooltipContent>
      </Tooltip>

      {open && (
        <div className="flex flex-col gap-1 rounded-lg border bg-background/95 backdrop-blur shadow-lg p-1">
          {basemaps.map((bm) => (
            <Button
              key={bm.id}
              size="sm"
              variant={active === bm.id ? "default" : "ghost"}
              className="justify-start gap-2 text-xs h-8 px-3"
              onClick={() => {
                onChange(bm.id);
                setOpen(false);
              }}
            >
              <bm.icon className="h-3.5 w-3.5" />
              {bm.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
