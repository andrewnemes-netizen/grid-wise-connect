import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useOutlookConnect } from "@/hooks/useOutlookConnect";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  /** Retry the original send after the user has successfully connected. */
  onRetry: () => void | Promise<void>;
  /** Admin-only break-glass: retry using the shared EcoPower mailbox. */
  onSendShared?: () => void | Promise<void>;
  /** Whether the parent is currently sending (disables buttons). */
  busy?: boolean;
  /** Short context — e.g. "quotation", "site survey", "POC assignment". */
  context?: string;
}

/**
 * Inline prompt shown when the send-* edge functions return
 * `outlook_not_connected`. Offers a one-click connect flow that retries the
 * send in place. Admins additionally see an explicit, labeled option to send
 * from the shared EcoPower mailbox — non-admins never see that button.
 */
export function OutlookNotConnectedInline({ onRetry, onSendShared, busy, context }: Props) {
  const connect = useOutlookConnect();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const ok = await connect();
      if (!ok) {
        toast.error("Outlook connect was cancelled");
        return;
      }
      toast.success("Outlook connected — retrying send…");
      await onRetry();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to connect Outlook");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <div className="font-medium text-amber-900">
            Your Outlook account isn't connected
          </div>
          <p className="text-amber-800 text-xs leading-relaxed">
            {context ? `This ${context} ` : "This email "}must be sent from your own
            Outlook mailbox. Connect once and we'll retry immediately —
            you won't lose what you've entered.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          onClick={handleConnect}
          disabled={connecting || busy}
        >
          {connecting ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Mail className="h-3 w-3 mr-1" />
          )}
          Connect Outlook & retry
        </Button>
        {isAdmin && onSendShared && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSendShared}
            disabled={connecting || busy}
            title="Admin-only override — sends from the EcoPower shared account"
          >
            Send from EcoPower shared account
          </Button>
        )}
      </div>
      {isAdmin && onSendShared && (
        <p className="text-[11px] text-amber-700/80">
          Admin override — the recipient will see the shared EcoPower address, not yours.
        </p>
      )}
    </div>
  );
}