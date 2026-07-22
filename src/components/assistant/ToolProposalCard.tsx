import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, Loader2, ShieldCheck, X, Zap, Mail } from "lucide-react";
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
  set_stage_status_bulk: (i) =>
    `Set stage “${i?.stage_key}” to “${i?.status}” for ${i?.site_ids?.length ?? 0} site(s).`,
  assign_stage_owner: (i) =>
    `Assign owner/recipients to stage “${i?.stage_key}” for ${i?.site_ids?.length ?? 0} site(s).`,
  reassign_waiting_stage_owner: (i) =>
    `Reassign waiting stage “${i?.stage_key}” for ${i?.site_ids?.length ?? 0} site(s) to a new owner.`,
  add_sites_to_wp: (i) => `Attach ${i?.site_ids?.length ?? 0} site(s) to this work package.`,
  remove_sites_from_wp: (i) => `Remove ${i?.site_ids?.length ?? 0} site(s) from this work package.`,
  queue_survey_for_sites: (i) => `Send a survey to ${i?.surveyor_email} for ${i?.site_ids?.length ?? 0} site(s).`,
  update_site_fields: (i) => `Update site fields: ${Object.keys(i?.fields ?? {}).join(", ")}.`,
  archive_programme: (i) => `Archive programme ${i?.programme_id?.slice(0, 8)}.`,
  archive_work_package: (i) => `Archive work package ${i?.work_package_id?.slice(0, 8)}.`,
  archive_site: (i) => `Archive site ${i?.site_id?.slice(0, 8)}.`,
  archive_programmes_bulk: (i) => `Archive ${i?.programme_ids?.length ?? 0} programme(s).`,
  archive_work_packages_bulk: (i) => `Archive ${i?.work_package_ids?.length ?? 0} work package(s).`,
};

type RiskTier = "safe" | "destructive" | "external" | "cost";

function riskTierFor(tool: string): RiskTier {
  switch (tool) {
    case "set_stage_status_bulk":
    case "assign_stage_owner":
    case "reassign_waiting_stage_owner":
      return "safe";
    case "queue_survey_for_sites":
      return "external";
    case "archive_programme":
    case "archive_work_package":
    case "archive_site":
    case "archive_programmes_bulk":
    case "archive_work_packages_bulk":
    case "remove_sites_from_wp":
      return "destructive";
    default:
      return "cost";
  }
}

function confirmPhrase(tool: string, input: any): string | null {
  if (tool === "remove_sites_from_wp") return `remove ${input?.site_ids?.length ?? 0} sites`;
  if (tool === "archive_programmes_bulk") return `archive ${input?.programme_ids?.length ?? 0} programmes`;
  if (tool === "archive_work_packages_bulk") return `archive ${input?.work_package_ids?.length ?? 0} work packages`;
  return null;
}

const RISK_STYLES: Record<RiskTier, { border: string; bg: string; text: string; icon: React.ReactNode; label: string }> = {
  safe: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/5",
    text: "text-emerald-600",
    icon: <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />,
    label: "Safe action",
  },
  cost: {
    border: "border-primary/30",
    bg: "bg-primary/5",
    text: "text-primary",
    icon: <Zap className="h-4 w-4 mt-0.5 shrink-0" />,
    label: "Action requested",
  },
  external: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
    text: "text-amber-600",
    icon: <Mail className="h-4 w-4 mt-0.5 shrink-0" />,
    label: "External action",
  },
  destructive: {
    border: "border-destructive/40",
    bg: "bg-destructive/5",
    text: "text-destructive",
    icon: <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />,
    label: "Destructive action",
  },
};

export function ToolProposalCard({ proposal, onDecide, disabled }: Props) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const tier = riskTierFor(proposal.toolName);
  const styles = RISK_STYLES[tier];
  const requiredPhrase = confirmPhrase(proposal.toolName, proposal.input);
  const canApprove = requiredPhrase ? phrase.trim().toLowerCase() === requiredPhrase : true;
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
    <Card className={cn("ml-11 mr-4 p-3 border-2", styles.border, styles.bg)}>
      <div className="flex items-start gap-2">
        <span className={styles.text}>{styles.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground flex items-center gap-2">
            {styles.label} · Approval required
          </div>
          <div className="text-sm font-medium mt-0.5">{preview}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Tool: <code className="font-mono">{proposal.toolName}</code> · Runs as you (RLS enforced)
          </div>

          {requiredPhrase && (
            <div className="mt-2">
              <label className="text-[11px] text-muted-foreground">
                Type <code className="font-mono">{requiredPhrase}</code> to confirm
              </label>
              <Input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={requiredPhrase}
                className="h-8 mt-1 text-sm"
                disabled={!!busy || disabled}
              />
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant={tier === "destructive" ? "destructive" : "default"}
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
