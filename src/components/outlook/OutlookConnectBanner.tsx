import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { outlookConnectFailureMessage, useOutlookConnectDetailed } from "@/hooks/useOutlookConnect";
import { useAuth } from "@/hooks/useAuth";

const DISMISS_KEY = "outlook-banner-dismissed-this-session";

/**
 * Global banner that nudges the signed-in user to connect their own Outlook
 * mailbox. Only rendered when we have an authenticated user, the connector
 * reports disconnected, and the banner hasn't been dismissed this session.
 */
export function OutlookConnectBanner() {
  const { user } = useAuth();
  const connect = useOutlookConnectDetailed();
  const [state, setState] = useState<"idle" | "checking" | "disconnected" | "hidden">("idle");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!user) {
      setState("hidden");
      return;
    }
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) {
      setState("hidden");
      return;
    }
    let cancelled = false;
    setState("checking");
    supabase.functions
      .invoke("outlook-connect-status")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setState("hidden"); return; }
        setState(data?.connected ? "hidden" : "disconnected");
      })
      .catch(() => !cancelled && setState("hidden"));
    return () => { cancelled = true; };
  }, [user?.id]);

  if (state !== "disconnected") return null;

  const dismiss = () => {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
    setState("hidden");
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await connect();
      if (result.ok) {
        toast.success("Outlook connected");
        setState("hidden");
      } else {
        toast.error(outlookConnectFailureMessage(result));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to connect Outlook");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 flex items-center gap-3 text-sm">
      <Mail className="h-4 w-4 text-amber-700 shrink-0" />
      <span className="text-amber-900 flex-1 min-w-0">
        Connect your Outlook mailbox so quotations, surveys and POC assignments send from your own address.
      </span>
      <Button size="sm" onClick={handleConnect} disabled={connecting}>
        {connecting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Mail className="h-3 w-3 mr-1" />}
        Connect Outlook
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}