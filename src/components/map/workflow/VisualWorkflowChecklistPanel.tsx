import { useState } from "react";
import { ChevronDown, ChevronUp, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VisualWorkflowState } from "@/hooks/useVisualWorkflow";

interface Props {
  workflow: VisualWorkflowState;
}

export function VisualWorkflowChecklistPanel({ workflow }: Props) {
  const [open, setOpen] = useState(true);
  const total = workflow.steps.length;
  const done = workflow.steps.filter((s) => workflow.states[s.id]).length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="rounded-md border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Workflow
          </span>
          <Badge variant="outline" className="text-[10px]">
            {done}/{total}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {open && (
        <ol className="px-3 py-2 space-y-1">
          {workflow.steps.map((step) => {
            const ok = workflow.states[step.id];
            return (
              <li
                key={step.id}
                className={`flex items-start gap-2 text-[11px] ${ok ? "text-foreground" : "text-muted-foreground"}`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full mt-0.5 ${
                    ok ? "bg-primary text-primary-foreground" : "border bg-background"
                  }`}
                >
                  {ok ? <Check className="h-2.5 w-2.5" /> : <Circle className="h-2 w-2 opacity-30" />}
                </span>
                <div className="min-w-0">
                  <p className={`font-medium leading-tight ${ok ? "" : ""}`}>
                    {step.number}. {step.label}
                  </p>
                  {!ok && (
                    <p className="text-[10px] leading-tight opacity-80">{step.hint}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}