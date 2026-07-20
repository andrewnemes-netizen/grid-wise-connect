import { supabase } from "@/integrations/supabase/client";

export interface SendSurveyRecipient {
  email: string;
  name?: string;
}

export interface SendSurveyOptions {
  siteIds: string[];
  recipients: SendSurveyRecipient[];
  message?: string;
  saveAsDefault?: boolean;
  deliveryMode?: "email" | "link_only";
  resentFromId?: string;
}

export interface SendSurveyResultLink {
  site_id: string;
  site_name?: string;
  email: string;
  survey_url: string;
  email_sent: boolean;
  survey_id?: string;
  error?: string;
  ok?: boolean;
}

export interface SendSurveyResponse {
  results: SendSurveyResultLink[];
  sent: number;
  failed: number;
}

/**
 * Canonical wrapper around the `send-site-survey` edge function.
 * Every UI surface that creates a survey token must go through here so the
 * server-side logic (token generation, PDF link, revoke chain) stays single-source.
 */
export async function sendSurveyToSites(opts: SendSurveyOptions): Promise<SendSurveyResponse> {
  const { data, error } = await supabase.functions.invoke("send-site-survey", {
    body: {
      site_ids: opts.siteIds,
      recipients: opts.recipients,
      message: opts.message,
      save_as_default: opts.saveAsDefault ?? false,
      delivery_mode: opts.deliveryMode ?? "email",
      resent_from_id: opts.resentFromId,
    },
  });
  if (error) throw error;
  const results: SendSurveyResultLink[] = (data?.results ?? []).filter((r: any) => r?.ok !== false);
  return {
    results,
    sent: results.filter((r) => r.email_sent).length,
    failed: data?.failed ?? 0,
  };
}