import { useState } from "react";
import { FileDown, Users, Building2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { VisualWorkflowState } from "@/hooks/useVisualWorkflow";

type Audience = "client" | "dno" | "installer";

interface Props {
  workflow: VisualWorkflowState;
  /** Existing PDF generator hook in (optional). When omitted, the panel just logs an event. */
  onExport?: (audience: Audience) => Promise<void> | void;
  disabled?: boolean;
}

const PACKS: Array<{ id: Audience; label: string; icon: React.ElementType; hint: string }> = [
  { id: "client", label: "Client pack", icon: Users, hint: "Pricing summary, no margin" },
  { id: "dno", label: "DNO pack", icon: Building2, hint: "Engineering data, no pricing" },
  { id: "installer", label: "Installer pack", icon: Wrench, hint: "Full BOQ + install detail" },
];

export function ExportPackSelector({ workflow, onExport, disabled }: Props) {
  const [busy, setBusy] = useState<Audience | null>(null);

  const handle = async (audience: Audience) => {
    setBusy(audience);
    try {
      if (onExport) {
        await onExport(audience);
      } else {
        toast.info(`${audience} pack export not wired yet — workflow event logged.`);
      }
      await workflow.logEvent("exported", `${audience}_pack`, { audience });
      workflow.setFlag("packExported", true);
    } catch (e) {
      console.error(e);
      toast.error("Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <FileDown className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Export pack
        </p>
      </div>
      {PACKS.map((p) => (
        <Button
          key={p.id}
          variant="outline"
          size="sm"
          className="w-full h-auto py-1.5 justify-start text-left"
          disabled={disabled || busy !== null}
          onClick={() => handle(p.id)}
        >
          <p.icon className="h-3 w-3 mr-2 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-medium leading-tight">{p.label}</span>
            <span className="block text-[9px] text-muted-foreground leading-tight">{p.hint}</span>
          </span>
          {busy === p.id && <span className="text-[10px]">…</span>}
        </Button>
      ))}
    </div>
  );
}