## Unblock survey testing without email, then re-verify the domain

Two independent things. The first lets you keep working today; the second restores email sends properly.

---

### 1. Add a "Generate link" mode to Send Survey (no email required)

Right now `send-site-survey` creates the survey record **and** sends the invite email in one step — if the email send fails, the whole call errors out and no token is created. We'll split those responsibilities so testing (and manual delivery via WhatsApp / SMS / hand-off) works even while email is down.

**Backend — `supabase/functions/send-site-survey/index.ts`**
- Accept a new `delivery_mode: "email" | "link_only"` flag (default `"email"`).
- Always create the `site_surveys` row and return `{ survey_id, survey_url, expires_at }`.
- Only invoke `send-transactional-email` when `delivery_mode === "email"`.
- If email send fails, keep the survey row (do not cancel it) and return `email_sent: false` along with the link, so the caller can share it manually.

**Frontend — `src/components/portfolio/SendSurveyDialog.tsx`**
- Add a mode toggle: "Send by email" / "Generate shareable link".
- In link-only mode: hide the message textarea, submit with `delivery_mode: "link_only"`, then show each returned `survey_url` with a Copy button and a "Copy all" action.
- In email mode: if the response reports `email_sent: false` for any recipient, still surface the link with a Copy button so nothing is lost.

**Frontend — `src/components/site/SiteSurveysPanel.tsx`**
- For every pending survey, expose a "Copy link" button that reconstructs `${origin}/survey/${token}`. (The token is already on the row.)

No schema changes required.

---

### 2. Re-verify the email domain `notify.ecopoweruk.com`

Verification expired because the NS delegation was never completed at your DNS provider. Fixing this restores both survey invite emails and any other app emails.

- Open **Project Settings → Emails** and click **Rerun Setup** for `notify.ecopoweruk.com`.
- The setup dialog will show the two `NS` records to add at your registrar (values are per-domain — always copy them from that dialog, not from anywhere else).
- Add those NS records at wherever DNS for `ecopoweruk.com` is hosted, then click **Verify Domain**. DNS can take up to 72 hours.
- Once verified, existing tokens keep working and new survey invites will send by email automatically.

If your DNS provider can't create NS records (e.g. Shopify-managed DNS), the two supported workarounds are: transfer the domain into Lovable, or move DNS hosting to a provider that supports NS records (Cloudflare's free plan works).

---

### Out of scope

- No changes to the PDF, form schema, storage bucket, or RPCs — those are all working after the previous fixes.
- No changes to `notify-survey-submitted`; it will start firing once the domain verifies.

### Testing after implementation

1. From Portfolio → Send Survey, switch to "Generate shareable link", pick a site, submit → confirm a URL appears with a Copy button and the corresponding `site_surveys` row exists.
2. Open the link in a private window, complete the form, submit → confirm PDF and response as before.
3. Once DNS verifies, retry "Send by email" and confirm a message arrives.
