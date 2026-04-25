import type { EquipmentType } from "@/hooks/useDesignMode";
import { EQUIPMENT_CONFIG } from "@/hooks/useDesignMode";
import { DEFAULT_LOAD_KVA } from "@/lib/designLoadCalc";
import { GripVertical } from "lucide-react";

interface DraggableEquipmentCardProps {
  type: EquipmentType;
  isDragging: boolean;
  onDragStart: (type: EquipmentType, e: React.DragEvent) => void;
  onDragEnd: () => void;
  /** Optional click-to-toggle fallback for keyboards / touch. */
  onClickFallback: (type: EquipmentType) => void;
  isClickActive: boolean;
}

/**
 * A FlowEmo-style draggable parts-shelf card.
 *
 * Drag → drop on map = create a new equipment marker at the drop point.
 * Click = falls back to the legacy click-to-place flow (keyboard / tablet).
 */
export function DraggableEquipmentCard({
  type,
  isDragging,
  onDragStart,
  onDragEnd,
  onClickFallback,
  isClickActive,
}: DraggableEquipmentCardProps) {
  const cfg = EQUIPMENT_CONFIG[type];
  const kva = DEFAULT_LOAD_KVA[type] ?? 0;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(type, e)}
      onDragEnd={onDragEnd}
      onClick={() => onClickFallback(type)}
      role="button"
      tabIndex={0}
      aria-label={`Drag ${cfg.label} onto the map`}
      className={`group relative flex items-center gap-2 rounded-md border p-2 text-left text-xs select-none cursor-grab active:cursor-grabbing
        ${isDragging ? "opacity-50 ring-2 ring-primary" : ""}
        ${isClickActive ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-muted/50"}
      `}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
        style={{ backgroundColor: cfg.color }}
      >
        {cfg.symbol}
      </span>
      <span className="font-medium flex-1 truncate">{cfg.label}</span>
      {kva > 0 && (
        <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
          {kva}kVA
        </span>
      )}
    </div>
  );
}