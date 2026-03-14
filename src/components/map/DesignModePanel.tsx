import { X, Trash2, PencilRuler, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { EquipmentType, DesignElement, CableType, DesignCable } from "@/hooks/useDesignMode";
import { EQUIPMENT_CONFIG, CABLE_CONFIG } from "@/hooks/useDesignMode";

interface DesignModePanelProps {
  studyName: string;
  elements: DesignElement[];
  placingType: EquipmentType | null;
  onSelectType: (type: EquipmentType | null) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  // Cable props
  cables: DesignCable[];
  drawingCableType: CableType | null;
  onSelectCableType: (type: CableType | null) => void;
  cableVertexCount: number;
  onRemoveCable: (id: string) => void;
}

const equipmentTypes: EquipmentType[] = [
  "transformer",
  "rmu",
  "feeder_pillar",
  "cutout",
  "joint",
  "pole",
  "ev_charger",
];

const cableTypes: CableType[] = ["lv_main", "lv_service", "hv_cable", "pilot_cable"];

export function DesignModePanel({
  studyName,
  elements,
  placingType,
  onSelectType,
  onRemove,
  onClearAll,
  onClose,
  cables,
  drawingCableType,
  onSelectCableType,
  cableVertexCount,
  onRemoveCable,
}: DesignModePanelProps) {
  return (
    <div className="absolute top-0 right-0 z-20 h-full w-80 border-l bg-background shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <PencilRuler className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Design Mode</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Study context */}
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Study</p>
            <p className="text-sm font-semibold">{studyName}</p>
          </div>

          {/* Equipment palette */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Place Equipment
            </p>
            <p className="text-[10px] text-muted-foreground">
              {placingType
                ? `Click on the map to place a ${EQUIPMENT_CONFIG[placingType].label}. Click again to deselect.`
                : "Select equipment type, then click on the map to place it."}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {equipmentTypes.map((type) => {
                const cfg = EQUIPMENT_CONFIG[type];
                const isActive = placingType === type;
                return (
                  <button
                    key={type}
                    onClick={() => onSelectType(isActive ? null : type)}
                    className={`flex items-center gap-2 rounded-md border p-2 text-left transition-colors text-xs
                      ${isActive ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50"}`}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    >
                      {cfg.symbol}
                    </span>
                    <span className="font-medium">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Cable palette */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Cable className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Draw Cable
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {drawingCableType
                ? cableVertexCount > 0
                  ? `${cableVertexCount} point${cableVertexCount !== 1 ? "s" : ""} — click to add more, double-click to finish.`
                  : `Click on the map to start drawing a ${CABLE_CONFIG[drawingCableType].label}. Double-click to finish.`
                : "Select cable type, then click on the map to draw a route."}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {cableTypes.map((type) => {
                const cfg = CABLE_CONFIG[type];
                const isActive = drawingCableType === type;
                return (
                  <button
                    key={type}
                    onClick={() => onSelectCableType(isActive ? null : type)}
                    className={`flex items-center gap-2 rounded-md border p-2 text-left transition-colors text-xs
                      ${isActive ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50"}`}
                  >
                    <span className="flex items-center shrink-0">
                      <svg width="24" height="6" viewBox="0 0 24 6">
                        <line
                          x1="0" y1="3" x2="24" y2="3"
                          stroke={cfg.color}
                          strokeWidth="3"
                          strokeDasharray={cfg.dasharray.length > 0 ? cfg.dasharray.join(",") : undefined}
                        />
                      </svg>
                    </span>
                    <span className="font-medium">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Placed elements list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Placed ({elements.length})
              </p>
              {(elements.length > 0 || cables.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-destructive hover:text-destructive"
                  onClick={onClearAll}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              )}
            </div>

            {elements.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No equipment placed yet.</p>
            ) : (
              <div className="space-y-1">
                {elements.map((el) => {
                  const cfg = EQUIPMENT_CONFIG[el.element_type];
                  return (
                    <div
                      key={el.id}
                      className="flex items-center gap-2 rounded-md border p-2 text-xs group"
                    >
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: cfg.color }}
                      >
                        {cfg.symbol}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{el.label || cfg.label}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {Number(el.lat).toFixed(5)}, {Number(el.lng).toFixed(5)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                        onClick={() => onRemove(el.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cables list */}
          {cables.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Cables ({cables.length})
              </p>
              <div className="space-y-1">
                {cables.map((cable) => {
                  const cfg = CABLE_CONFIG[cable.cable_type as CableType] || CABLE_CONFIG.lv_main;
                  return (
                    <div
                      key={cable.id}
                      className="flex items-center gap-2 rounded-md border p-2 text-xs group"
                    >
                      <span className="shrink-0">
                        <svg width="16" height="6" viewBox="0 0 16 6">
                          <line
                            x1="0" y1="3" x2="16" y2="3"
                            stroke={cfg.color}
                            strokeWidth="3"
                            strokeDasharray={cfg.dasharray.length > 0 ? cfg.dasharray.join(",") : undefined}
                          />
                        </svg>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{cable.label || cfg.label}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {Math.round(cable.length_m).toLocaleString()}m
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                        onClick={() => onRemoveCable(cable.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary badges */}
          {(elements.length > 0 || cables.length > 0) && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
                <div className="flex flex-wrap gap-1">
                  {equipmentTypes.map((type) => {
                    const count = elements.filter((e) => e.element_type === type).length;
                    if (count === 0) return null;
                    const cfg = EQUIPMENT_CONFIG[type];
                    return (
                      <Badge key={type} variant="outline" className="text-[10px]">
                        {cfg.label}: {count}
                      </Badge>
                    );
                  })}
                  {cableTypes.map((type) => {
                    const matching = cables.filter((c) => c.cable_type === type);
                    if (matching.length === 0) return null;
                    const cfg = CABLE_CONFIG[type];
                    const totalLength = Math.round(matching.reduce((s, c) => s + c.length_m, 0));
                    return (
                      <Badge key={type} variant="outline" className="text-[10px]">
                        {cfg.label}: {matching.length} ({totalLength.toLocaleString()}m)
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
