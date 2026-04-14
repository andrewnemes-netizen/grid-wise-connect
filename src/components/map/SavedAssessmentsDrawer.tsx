import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SavedAssessment } from "./AssessmentPanel";

interface SavedAssessmentsDrawerProps {
  assessments: SavedAssessment[];
  onDelete: (id: string) => void;
  onCompare: (ids: string[]) => void;
}

const scoreBadgeVariant: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  GREEN: "default",
  AMBER: "secondary",
  RED: "destructive",
};

export function SavedAssessmentsDrawer({ assessments, onDelete, onCompare }: SavedAssessmentsDrawerProps) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (assessments.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg bg-muted/20">
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/40 transition-colors">
          <span>Saved Options ({assessments.length})</span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ScrollArea className="max-h-48">
          <div className="px-3 pb-2 space-y-1.5">
            {assessments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs"
              >
                <Checkbox
                  checked={selected.has(a.id)}
                  onCheckedChange={() => toggle(a.id)}
                  className="h-3.5 w-3.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.label}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant={scoreBadgeVariant[a.result.score] ?? "outline"} className="text-[9px] px-1 py-0">
                      {a.result.score}
                    </Badge>
                    <span className="text-muted-foreground">{a.voltageLevel}</span>
                    <span className="text-muted-foreground">£{a.totalEstimate.toLocaleString()}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onDelete(a.id)}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {selected.size >= 2 && (
          <div className="px-3 pb-3">
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => onCompare(Array.from(selected))}
            >
              <GitCompareArrows className="mr-1.5 h-3.5 w-3.5" />
              Compare {selected.size} Options
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
