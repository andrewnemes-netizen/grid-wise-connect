import { useState } from "react";
import { Map, Satellite, Mountain, Compass, Hexagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

export type BasemapId =
  | "street"
  | "satellite"
  | "satellite-hd"
  | "google-satellite"
  | "topo"
  | "os-road"
  | "os-outdoor"
  | "os-light"
  | "os-vector";

interface BasemapOption {
  id: BasemapId;
  icon: typeof Map;
  label: string;
  group: "standard" | "os";
}

const basemaps: BasemapOption[] = [
  { id: "street", icon: Map, label: "Street", group: "standard" },
  { id: "satellite", icon: Satellite, label: "Satellite", group: "standard" },
  { id: "satellite-hd", icon: Satellite, label: "Satellite HD", group: "standard" },
  { id: "google-satellite", icon: Satellite, label: "Google Satellite", group: "standard" },
  { id: "topo", icon: Mountain, label: "Topographic", group: "standard" },
  { id: "os-road", icon: Compass, label: "OS Road", group: "os" },
  { id: "os-outdoor", icon: Compass, label: "OS Outdoor", group: "os" },
  { id: "os-light", icon: Compass, label: "OS Light", group: "os" },
  { id: "os-vector", icon: Hexagon, label: "OS Vector", group: "os" },
];

interface BasemapSwitcherProps {
  active: BasemapId;
  onChange: (id: BasemapId) => void;
}

export function BasemapSwitcher({ active, onChange }: BasemapSwitcherProps) {
  const [open, setOpen] = useState(false);

  const standardMaps = basemaps.filter((b) => b.group === "standard");
  const osMaps = basemaps.filter((b) => b.group === "os");

  return (
    <div className="absolute bottom-8 left-3 z-10 flex flex-col-reverse items-start gap-1">
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
        <div className="flex flex-col gap-1 rounded-lg border bg-background/95 backdrop-blur shadow-lg p-1 max-h-[60vh] overflow-y-auto">
          {standardMaps.map((bm) => (
            <Button
              key={bm.id}
              size="sm"
              variant={active === bm.id ? "default" : "ghost"}
              className="justify-start gap-2 text-xs h-8 px-3"
              onClick={() => { onChange(bm.id); setOpen(false); }}
            >
              <bm.icon className="h-3.5 w-3.5" />
              {bm.label}
            </Button>
          ))}
          <Separator className="my-0.5" />
          <span className="text-[9px] text-muted-foreground px-3 py-0.5 font-semibold uppercase tracking-wider">
            Ordnance Survey
          </span>
          {osMaps.map((bm) => (
            <Button
              key={bm.id}
              size="sm"
              variant={active === bm.id ? "default" : "ghost"}
              className="justify-start gap-2 text-xs h-8 px-3"
              onClick={() => { onChange(bm.id); setOpen(false); }}
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
