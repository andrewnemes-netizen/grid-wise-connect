import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Opens the per-user Microsoft Outlook OAuth popup and resolves once the
 * user has finished (either by success message from the callback page, or by
 * closing the popup). Returns `true` only when we got a success message.
 *
 * Shared by the settings page, the global banner, and every inline
 * "Connect Outlook & retry" prompt on send dialogs.
 */
export function useOutlookConnect() {
  return useCallback(async (): Promise<boolean> => {
    const returnUrl = `${window.location.origin}/auth/outlook/callback`;
    const { data, error } = await supabase.functions.invoke("outlook-connect-start", {
      body: { return_url: returnUrl },
    });
    if (error || !data?.authorization_url) {
      throw new Error(error?.message ?? "Failed to start Outlook connect");
    }
    const popup = window.open(data.authorization_url, "outlook-connect", "width=520,height=720");
    if (!popup) throw new Error("Popup blocked — please allow popups for this site.");

    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage);
        clearInterval(poll);
        resolve(ok);
      };
      const onMessage = (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin) return;
        if (ev.data?.type !== "outlook-oauth-complete") return;
        finish(true);
      };
      window.addEventListener("message", onMessage);
      const poll = setInterval(() => {
        if (popup.closed) finish(false);
      }, 800);
    });
  }, []);
}

/** Marker error thrown by helpers when the edge function reports outlook_not_connected. */
export class OutlookNotConnectedError extends Error {
  constructor() {
    super("outlook_not_connected");
    this.name = "OutlookNotConnectedError";
  }
}

/** True when a supabase.functions.invoke response body indicates the caller must connect Outlook first. */
export function isOutlookNotConnected(data: any): boolean {
  return !!data && data.error === "outlook_not_connected";
}