import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoardView, BoardViewConfig } from "@/lib/board/types";
import { Check, Plus, Trash2, Star } from "lucide-react";

export function ViewsMenu({
  views,
  activeId,
  currentConfig,
  onSelect,
  onSave,
  onDelete,
  onSetDefault,
}: {
  views: BoardView[];
  activeId: string | null;
  currentConfig: BoardViewConfig;
  onSelect: (id: string) => void;
  onSave: (name: string, config: BoardViewConfig) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const active = views.find((v) => v.id === activeId);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          View: {active?.name ?? "Default"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase px-1">Saved views</div>
        {views.length === 0 && <div className="text-xs text-muted-foreground px-2 py-3">No saved views yet.</div>}
        {views.map((v) => (
          <div key={v.id} className="flex items-center gap-1">
            <button
              onClick={() => onSelect(v.id)}
              className="flex-1 text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2"
            >
              {v.id === activeId && <Check className="h-3 w-3" />}
              <span className="flex-1">{v.name}</span>
              {v.is_default && <Star className="h-3 w-3 fill-current text-yellow-500" />}
            </button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onSetDefault(v.id)}>
              <Star className="h-3 w-3" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDelete(v.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <div className="border-t pt-2 space-y-1">
          <div className="text-xs font-medium text-muted-foreground uppercase px-1">Save current as</div>
          <div className="flex gap-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My view" className="h-7 text-xs" />
            <Button size="sm" className="h-7" disabled={!name.trim()} onClick={() => { onSave(name, currentConfig); setName(""); }}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}