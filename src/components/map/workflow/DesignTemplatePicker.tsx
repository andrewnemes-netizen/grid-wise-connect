import { useState } from "react";
import { LayoutTemplate, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DESIGN_TEMPLATES, templateToCoords, type DesignTemplate } from "@/lib/designWorkflow/templates";

interface Props {
  /** Anchor for placement — usually current map centre. */
  anchor: { lng: number; lat: number } | null;
  /** Bulk insert callback (re-uses existing useDesignMode bulkInsert). */
  onApply: (
    items: Array<{ type: string; lng: number; lat: number; label?: string }>,
    templateName: string
  ) => Promise<void> | void;
}

export function DesignTemplatePicker({ anchor, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const handleApply = async (template: DesignTemplate) => {
    if (!anchor) return;
    setBusy(template.id);
    try {
      const coords = templateToCoords(template, anchor);
      await onApply(coords, template.name);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Templates
          </span>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {!anchor && (
            <p className="text-[10px] text-muted-foreground italic">
              Centre the map on the site to enable templates.
            </p>
          )}
          {DESIGN_TEMPLATES.map((t) => (
            <div
              key={t.id}
              className="rounded-md border bg-background p-2 flex items-center gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold leading-tight truncate">{t.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight truncate">
                  {t.description}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2"
                disabled={!anchor || busy !== null}
                onClick={() => handleApply(t)}
              >
                {busy === t.id ? "…" : "Place"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}