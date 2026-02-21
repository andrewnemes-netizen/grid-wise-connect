import { X, Trash2, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { EquipmentType, DesignElement } from "@/hooks/useDesignMode";
import { EQUIPMENT_CONFIG } from "@/hooks/useDesignMode";

interface DesignModePanelProps {
  studyName: string;
  elements: DesignElement[];
  placingType: EquipmentType | null;
  onSelectType: (type: EquipmentType | null) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

const equipmentTypes: EquipmentType[] = [
  "transformer",
  "rmu",
  "feeder_pillar",
  "cutout",
  "joint",
  "pole",
];

export function DesignModePanel({
  studyName,
  elements,
  placingType,
  onSelectType,
  onRemove,
  onClearAll,
  onClose,
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

          {/* Placed elements list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Placed ({elements.length})
              </p>
              {elements.length > 0 && (
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

          {/* Summary badges */}
          {elements.length > 0 && (
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
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
