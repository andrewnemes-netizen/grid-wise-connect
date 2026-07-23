import { useEffect } from "react";

export default function OutlookCallback() {
  useEffect(() => {
    try {
      if (window.opener) {
        window.opener.postMessage(
          { type: "outlook-oauth-complete", href: window.location.href },
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
        <div className="text-lg font-medium">Outlook connected</div>
        <div className="text-sm text-muted-foreground">You can close this window.</div>
      </div>
    </div>
  );
}