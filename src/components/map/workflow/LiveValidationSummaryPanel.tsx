import { ShieldCheck, Zap, PoundSterling, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VisualWorkflowState } from "@/hooks/useVisualWorkflow";

interface Props {
  workflow: VisualWorkflowState;
}

function StatusPill({
  icon: Icon,
  label,
  passed,
  onToggle,
}: {
  icon: React.ElementType;
  label: string;
  passed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px] w-full transition-colors ${
        passed
          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          : "bg-muted/30 hover:bg-muted/60"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        <span className="font-medium">{label}</span>
      </span>
      {passed ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

export function LiveValidationSummaryPanel({ workflow }: Props) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Live Validation
      </p>
      <StatusPill
        icon={ShieldCheck}
        label="DNO rules"
        passed={workflow.flags.dnoRulesPassed}
        onToggle={() => workflow.setFlag("dnoRulesPassed", !workflow.flags.dnoRulesPassed)}
      />
      <StatusPill
        icon={Zap}
        label="Electrical sizing"
        passed={workflow.flags.electricalValidated}
        onToggle={() =>
          workflow.setFlag("electricalValidated", !workflow.flags.electricalValidated)
        }
      />
      <StatusPill
        icon={PoundSterling}
        label="Cost & BOQ"
        passed={workflow.flags.costGenerated}
        onToggle={() => workflow.setFlag("costGenerated", !workflow.flags.costGenerated)}
      />
      <p className="text-[9px] text-muted-foreground italic">
        Recalculated automatically when the design changes.
      </p>
    </div>
  );
}