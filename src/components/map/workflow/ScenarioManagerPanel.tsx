import { useState } from "react";
import { Layers, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Lightweight scenario UI placeholder. Persistence is wired in a follow-up;
 * for now this manages an in-memory list so the workflow surface is visible.
 */
export interface Scenario {
  id: string;
  name: string;
  optionType?: string;
  isActive: boolean;
}

interface Props {
  scenarios: Scenario[];
  onActivate: (id: string) => void;
  onCreate: (name: string) => void;
}

const QUICK_NAMES = [
  "Existing Supply",
  "New LV Connection",
  "LV Mains Extension",
  "11kV Option",
  "EV + BESS",
];

export function ScenarioManagerPanel({ scenarios, onActivate, onCreate }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Scenarios
          </span>
          <Badge variant="outline" className="text-[10px]">
            {scenarios.length}
          </Badge>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {scenarios.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">
              The current design is the default scenario. Add another to compare.
            </p>
          )}
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onActivate(s.id)}
              className={`w-full flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px] ${
                s.isActive ? "border-primary bg-primary/10" : "hover:bg-muted/50"
              }`}
            >
              <span className="font-medium truncate">{s.name}</span>
              {s.isActive && <Badge className="text-[9px]">Active</Badge>}
            </button>
          ))}
          <div className="pt-1 border-t flex flex-wrap gap-1">
            {QUICK_NAMES.map((n) => (
              <Button
                key={n}
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => onCreate(n)}
              >
                <Plus className="h-2.5 w-2.5 mr-1" />
                {n}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}