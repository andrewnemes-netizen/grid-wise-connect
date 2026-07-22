import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolProposal {
  toolName: string;
  toolCallId: string;
  input: any;
  destructive?: boolean;
}

interface Props {
  proposal: ToolProposal;
  onDecide: (decision: "approve" | "reject") => Promise<void> | void;
  disabled?: boolean;
}

const PREVIEWS: Record<string, (input: any) => string> = {
  mark_stage_done_bulk: (i) =>
    `Mark stage “${i?.stage_key}” DONE for ${i?.site_ids?.length ?? 0} site(s)${
      i?.next_stage_recipient_user_ids?.length
        ? `, and assign ${i.next_stage_recipient_user_ids.length} owner(s) to the next stage`
        : ""
    }.`,
  add_sites_to_wp: (i) => `Attach ${i?.site_ids?.length ?? 0} site(s) to this work package.`,
  remove_sites_from_wp: (i) => `Remove ${i?.site_ids?.length ?? 0} site(s) from this work package.`,
  queue_survey_for_sites: (i) => `Send a survey to ${i?.surveyor_email} for ${i?.site_ids?.length ?? 0} site(s).`,
  update_site_fields: (i) => `Update site fields: ${Object.keys(i?.fields ?? {}).join(", ")}.`,
};

const DESTRUCTIVE_TOOLS = new Set(["remove_sites_from_wp"]);

export function ToolProposalCard({ proposal, onDecide, disabled }: Props) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const destructive = DESTRUCTIVE_TOOLS.has(proposal.toolName);
  const requiredPhrase = destructive
    ? `remove ${proposal.input?.site_ids?.length ?? 0} sites`
    : null;
  const canApprove = destructive ? phrase.trim().toLowerCase() === requiredPhrase : true;
  const preview = PREVIEWS[proposal.toolName]?.(proposal.input) ?? `Run ${proposal.toolName}`;

  async function handle(decision: "approve" | "reject") {
    setBusy(decision);
    try {
      await onDecide(decision);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      className={cn(
        "ml-11 mr-4 p-3 border-2",
        destructive ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex items-start gap-2">
        {destructive ? (
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
            Assistant proposes an action · Approval required
          </div>
          <div className="text-sm font-medium mt-0.5">{preview}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Tool: <code className="font-mono">{proposal.toolName}</code> · Runs as you (RLS enforced)
          </div>

          {destructive && (
            <div className="mt-2">
              <label className="text-[11px] text-muted-foreground">
                Type <code className="font-mono">{requiredPhrase}</code> to confirm
              </label>
              <Input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={requiredPhrase ?? ""}
                className="h-8 mt-1 text-sm"
                disabled={!!busy || disabled}
              />
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant={destructive ? "destructive" : "default"}
              disabled={!!busy || disabled || !canApprove}
              onClick={() => handle("approve")}
            >
              {busy === "approve" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Approve & run
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy || disabled}
              onClick={() => handle("reject")}
            >
              {busy === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              Reject
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}