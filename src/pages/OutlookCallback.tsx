import { useEffect } from "react";

export default function OutlookCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const errorDescription = params.get("error_description");
    try {
      if (window.opener) {
        window.opener.postMessage(
          error
            ? {
                type: "outlook-oauth-error",
                error,
                errorDescription,
                message: errorDescription || error,
                href: window.location.href,
              }
            : { type: "outlook-oauth-complete", href: window.location.href },
          window.location.origin,
        );
      }
    } catch { /* ignore */ }
    const t = setTimeout(() => window.close(), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-2">
        <div className="text-lg font-medium">Outlook sign-in finished</div>
        <div className="text-sm text-muted-foreground">Checking the mailbox connection in the main window…</div>
      </div>
    </div>
  );
}