import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OutlookConnectResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "wrong_tenant" | "timeout" | "oauth_error"; message?: string; email?: string };

export function outlookConnectFailureMessage(result: OutlookConnectResult): string {
  if (result.ok === true) return "Outlook connected";
  if (result.message) return result.message;
  if (result.reason === "wrong_tenant") return "Only ecopoweruk.com accounts can be connected.";
  if (result.reason === "oauth_error") return "Microsoft sign-in did not complete. Try again and complete the prompt.";
  if (result.reason === "timeout") return "Outlook did not confirm the connection. Try again, then wait for the popup to close.";
  return "Outlook connection was not completed — finish Microsoft sign-in and consent, then try again.";
}

async function waitForVerifiedOutlookConnection(): Promise<OutlookConnectResult> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data } = await supabase.functions.invoke("outlook-connect-status");
    if (data?.connected === true) return { ok: true };
    if (data?.reason === "wrong_tenant") {
      return {
        ok: false,
        reason: "wrong_tenant",
        message: data?.message ?? "Only ecopoweruk.com accounts can be connected.",
        email: data?.email,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return { ok: false, reason: "timeout" };
}

/**
 * Opens the per-user Microsoft Outlook OAuth popup and resolves once the
 * user has finished (either by success message from the callback page, or by
 * closing the popup). Returns `true` only after the backend confirms the
 * mailbox credential is actually stored and usable.
 *
 * Shared by the settings page, the global banner, and every inline
 * "Connect Outlook & retry" prompt on send dialogs.
 */
export function useOutlookConnect() {
  return useCallback(async (): Promise<boolean> => {
    const result = await connectOutlookDetailed();
    return result.ok === true;
  }, []);
}

/** Same flow as useOutlookConnect but returns the detailed reason on failure. */
export function useOutlookConnectDetailed() {
  return useCallback(async (): Promise<OutlookConnectResult> => connectOutlookDetailed(), []);
}

async function connectOutlookDetailed(): Promise<OutlookConnectResult> {
    const returnUrl = `${window.location.origin}/auth/outlook/callback`;
    const { data, error } = await supabase.functions.invoke("outlook-connect-start", {
      body: { return_url: returnUrl },
    });
    if (error || !data?.authorization_url) {
      throw new Error(error?.message ?? "Failed to start Outlook connect");
    }
    // Force Microsoft to show the account picker / login page every time,
    // even when the browser already has an SSO session for another account.
    // Without this, Entra silently re-consents the cached account and the
    // popup closes so fast it looks like nothing happened.
    let authUrl = data.authorization_url as string;
    try {
      const u = new URL(authUrl);
      u.searchParams.set("prompt", "select_account");
      authUrl = u.toString();
    } catch {
      authUrl += (authUrl.includes("?") ? "&" : "?") + "prompt=select_account";
    }
    const popup = window.open(authUrl, "outlook-connect", "width=520,height=720");
    if (!popup) throw new Error("Popup blocked — please allow popups for this site.");

    return new Promise<OutlookConnectResult>((resolve) => {
      let done = false;
      const finish = async (result: OutlookConnectResult | "verify") => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage);
        clearInterval(poll);
        if (result === "verify") resolve(await waitForVerifiedOutlookConnection());
        else resolve(result);
      };
      const onMessage = (ev: MessageEvent) => {
        if (ev.origin !== window.location.origin) return;
        if (ev.data?.type === "outlook-oauth-error") {
          finish({
            ok: false,
            reason: "oauth_error",
            message:
              ev.data?.message ??
              ev.data?.errorDescription ??
              ev.data?.error ??
              "Microsoft sign-in did not complete.",
          });
          return;
        }
        if (ev.data?.type !== "outlook-oauth-complete") return;
        finish("verify");
      };
      window.addEventListener("message", onMessage);
      const poll = setInterval(() => {
        if (popup.closed) finish({ ok: false, reason: "cancelled" });
      }, 800);
    });
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