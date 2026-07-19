import { supabase } from "@/integrations/supabase/client";

export interface SendSurveySite {
  id: string;
  site_name?: string | null;
  surveyor_email: string | null;
}

export interface SendSurveyLink {
  site_id: string;
  site_name?: string;
  email: string;
  survey_url: string;
  email_sent: boolean;
  error?: string;
}

export interface SendSurveyParams {
  /** Sites with their saved surveyor contact (id + surveyor_email required). */
  sites: SendSurveySite[];
  /** Delivery channel. */
  deliveryMode: "email" | "link_only";
  /** When emailing, also send to each site's saved surveyor_email. */
  useSiteContact?: boolean;
  /** Additional email addresses (already trimmed / validated by caller). */
  extraEmails?: string[];
  /** Optional named surveyor for the greeting. */
  surveyorName?: string;
  /** Optional message body for the email. */
  message?: string;
  /**
   * When true and the bulk-extras path runs, the edge function will save the first
   * extra email as the site's default surveyor contact where none exists.
   */
  saveAsDefaultForExtras?: boolean;
}

export interface SendSurveyResult {
  results: SendSurveyLink[];
  emailedCount: number;
  linksOnlyCount: number;
  failedCount: number;
}

/**
 * Shared survey-invite dispatcher. Handles the link_only per-site loop, the
 * per-site saved-contact loop, and the bulk extras-across-all-sites send —
 * then aggregates the edge function results into flat counts + a link list.
 * Both SendSurveyDialog (portfolio) and QueueSurveyDialog (wp) call this.
 */
export async function sendSurveyToSites(params: SendSurveyParams): Promise<SendSurveyResult> {
  const {
    sites,
    deliveryMode,
    useSiteContact = false,
    extraEmails = [],
    surveyorName,
    message,
    saveAsDefaultForExtras = false,
  } = params;

  const rawResults: any[] = [];

  if (deliveryMode === "link_only") {
    // One placeholder recipient per site so each site gets a unique token.
    for (const s of sites) {
      const recipients = [{
        email: s.surveyor_email || `link-only+${s.id.slice(0, 8)}@ecopoweruk.local`,
        name: surveyorName || "Site surveyor",
      }];
      const { data, error } = await supabase.functions.invoke("send-site-survey", {
        body: {
          site_ids: [s.id],
          recipients,
          delivery_mode: "link_only",
          save_as_default: false,
        },
      });
      if (error) throw error;
      rawResults.push(data);
    }
  } else {
    // Per-site sends using saved surveyor contacts.
    if (useSiteContact) {
      const sitesWithContact = sites.filter((s) => !!s.surveyor_email);
      for (const s of sitesWithContact) {
        const recipients = [{ email: s.surveyor_email!, name: surveyorName || undefined }];
        const { data, error } = await supabase.functions.invoke("send-site-survey", {
          body: {
            site_ids: [s.id],
            recipients,
            message: message || undefined,
            save_as_default: false,
            delivery_mode: "email",
          },
        });
        if (error) throw error;
        rawResults.push(data);
      }
    }

    // Bulk extras across all sites.
    if (extraEmails.length > 0) {
      const recipients = extraEmails.map((email) => ({ email, name: surveyorName || undefined }));
      const { data, error } = await supabase.functions.invoke("send-site-survey", {
        body: {
          site_ids: sites.map((s) => s.id),
          recipients,
          message: message || undefined,
          save_as_default: saveAsDefaultForExtras,
          delivery_mode: "email",
        },
      });
      if (error) throw error;
      rawResults.push(data);
    }
  }

  const results: SendSurveyLink[] = rawResults.flatMap(
    (r) => (r?.results ?? []).filter((x: any) => x.ok),
  );
  const emailedCount = results.filter((l) => l.email_sent).length;
  const linksOnlyCount = results.filter((l) => !l.email_sent).length;
  const failedCount = rawResults.reduce((n, r) => n + (r?.failed ?? 0), 0);

  return { results, emailedCount, linksOnlyCount, failedCount };
}