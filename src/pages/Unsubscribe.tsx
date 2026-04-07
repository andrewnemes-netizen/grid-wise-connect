import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, MailX } from "lucide-react";

type State = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function Unsubscribe() {
  const [state, setState] = useState<State>("loading");
  const [processing, setProcessing] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }

    const validate = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        if (!res.ok) { setState("invalid"); return; }
        const data = await res.json();
        if (data.valid === false && data.reason === "already_unsubscribed") setState("already");
        else if (data.valid) setState("valid");
        else setState("invalid");
      } catch { setState("error"); }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) setState("success");
      else if (data?.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch { setState("error"); }
    finally { setProcessing(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {state === "loading" && (
            <>
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">Validating…</p>
            </>
          )}
          {state === "valid" && (
            <>
              <MailX className="h-10 w-10 mx-auto text-primary" />
              <h2 className="text-xl font-semibold">Unsubscribe</h2>
              <p className="text-muted-foreground text-sm">
                Click below to unsubscribe from app emails. You will still receive essential account emails.
              </p>
              <Button onClick={handleUnsubscribe} disabled={processing} className="w-full">
                {processing ? "Processing…" : "Confirm Unsubscribe"}
              </Button>
            </>
          )}
          {state === "success" && (
            <>
              <CheckCircle className="h-10 w-10 mx-auto text-green-600" />
              <h2 className="text-xl font-semibold">Unsubscribed</h2>
              <p className="text-muted-foreground text-sm">You've been unsubscribed successfully.</p>
            </>
          )}
          {state === "already" && (
            <>
              <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground" />
              <h2 className="text-xl font-semibold">Already Unsubscribed</h2>
              <p className="text-muted-foreground text-sm">This email address has already been unsubscribed.</p>
            </>
          )}
          {(state === "invalid" || state === "error") && (
            <>
              <XCircle className="h-10 w-10 mx-auto text-destructive" />
              <h2 className="text-xl font-semibold">Invalid Link</h2>
              <p className="text-muted-foreground text-sm">This unsubscribe link is invalid or has expired.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
