import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { useOutlookConnect } from "@/hooks/useOutlookConnect";

export default function OutlookConnect() {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected" | "error">("loading");
  const [connecting, setConnecting] = useState(false);
  const connect = useOutlookConnect();

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase.functions.invoke("outlook-connect-status");
    if (error) { setStatus("error"); return; }
    setStatus(data?.connected ? "connected" : "disconnected");
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const startConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const ok = await connect();
      if (!ok) {
        toast.error("Outlook connection was not completed — finish Microsoft sign-in and consent, then try again.");
        await refresh();
        return;
      }
      toast.success("Outlook connected");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect Outlook");
    } finally {
      setConnecting(false);
    }
  }, [connect, refresh]);

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Connect your Outlook mailbox</h1>
          <p className="text-sm text-muted-foreground">
            Send site surveys, quotations and POC assignment emails from your own Outlook account.
          </p>
        </div>
      </div>
      <Card className="p-4 space-y-3">
        {status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        )}
        {status === "connected" && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <span>Your Outlook mailbox is connected. Outbound emails will be sent from your address.</span>
          </div>
        )}
        {status === "disconnected" && (
          <div className="text-sm text-muted-foreground">
            Not connected yet. Emails that require your mailbox will pause until you connect Outlook.
          </div>
        )}
        {status === "error" && (
          <div className="text-sm text-destructive">Could not check connection status.</div>
        )}
        <div className="flex gap-2 pt-2">
          <Button onClick={startConnect} disabled={connecting}>
            {connecting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting…</>)
              : status === "connected" ? "Reconnect Outlook" : "Connect Outlook"}
          </Button>
          <Button variant="outline" onClick={refresh} disabled={status === "loading"}>Refresh</Button>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">
        You'll be redirected to Microsoft to sign in and grant permission. Tokens are stored securely by
        the Lovable connector gateway — this app never sees them.
      </p>
    </div>
  );
}