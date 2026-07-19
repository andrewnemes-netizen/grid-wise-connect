# External Survey Public Flow — Fix + Harden

## Root cause of the current problem

The `/survey/:token` route is **already public** in `src/App.tsx` (not wrapped in `ProtectedRoute`) and the `get_survey_by_token` RPC is already granted to `anon`. The reason external users land on the login page is that the invite links are generated with `window.location.origin`, so when a link is sent from the Lovable editor it points at `id-preview--…lovable.app` — that host requires a Lovable account. Published `.lovable.app` and custom domains are public and work today.

So this is primarily a **link-generation + capability gap**, not a routing rewrite. No new `/external-survey/{token}` route is needed — reusing `/survey/:token` keeps one URL surface, all existing survey rows valid, and the OneDrive/email/site_photos pipeline intact.

---

## Scope

### Phase 1 — Fix (must ship)
1. **Public link always uses the published domain.**
   - Add a project setting `public_app_base_url` in `app_settings` (admin-editable in `/admin`), default to the current custom/published domain.
   - `send-site-survey` edge function: prefer `public_app_base_url` from `app_settings`, then request body, then `window.location.origin`. Never emit preview links.
   - Update `SendSurveyDialog` and `QueueSurveyDialog` to stop passing `window.location.origin` — the function decides.
   - "Copy link" in `SiteSurveysPanel` reads the same setting.
2. **Verify anon path end-to-end** (RPC grants, storage upload policy for the `site-surveys` bucket for anon writes scoped by token path). Tighten `site-surveys` bucket policies so anon can write only under `submissions/<token>/…` and only while the survey is `pending`.
3. **Public-safe survey view.** `SurveyForm` already only shows site name + postcode via the RPC — audit to confirm no auth-only calls run for anon (currently `supabase.rpc("get_survey_by_token")` is anon-safe; the direct `sites` update on submit path is gated by the server-side RPC).
4. **Route hygiene.** Confirm `/survey/:token` renders standalone (no `DashboardLayout`, no `NotificationsBell`, no `useAuth` reads that redirect). Add a `<meta name="robots" content="noindex">` on the page.

### Phase 2 — Admin controls (revoke / extend / resend / PIN)
1. Add columns to `site_surveys`: `revoked_at`, `revoked_by`, `pin_hash` (nullable), `opened_at`, `last_saved_at`, `submission_reference` (short human ref like `SUR-AB12CD`).
2. RPC `revoke_survey(token)`, `extend_survey(token, new_expiry)`, `resend_survey(token)` — SECURITY DEFINER, capability-checked.
3. `get_survey_by_token` returns `pin_required` boolean only; if PIN set, `SurveyForm` prompts once and calls new `verify_survey_pin(token, pin)` RPC (rate-limited).
4. Extend `SiteSurveysPanel` with Revoke / Extend / Resend / Copy link actions and status timeline (sent / opened / in_progress / submitted / expired / revoked).

### Phase 3 — Draft autosave
1. New table `site_survey_drafts (survey_id pk, submission jsonb, updated_at)` written by anon-safe RPC `save_survey_draft(token, submission)` (throttled, size-capped).
2. `SurveyForm` autosaves every 5s of idle typing, restores draft on reload, and shows "Saved just now". Draft is cleared on final submit.

### Phase 4 — Submission side-effects (partially done)
Confirm the existing `submit_survey_by_token` + `notify-survey-submitted` chain already: writes back to site, registers photos, mirrors PDF to OneDrive, emails owner. Add:
- Stamp `submission_reference` on submission and show it in the "Survey submitted" screen.
- Auto-complete matching `wp_tasks` of kind `survey_alloc` for the site (mark done) and pass a `survey` gate in `site_stage_status` when `overall_status = 'Complete'` (blocker otherwise). This closes the loop into Site Readiness / Delivery Matrix that the user asked for.
- Write to `audit_log` and `project_activity`.

### Out of scope (call out, don't build)
- SMS sending (no SMS provider connected). We'll produce a copy-link + email flow; SMS can plug in later.
- Full offline-first PWA. We'll do resilient autosave + retry, not a service worker.
- Malware AV scanning. We'll enforce file type + size + storage RLS; AV can be added via a follow-up worker.

---

## Technical section

**Files touched**
- `supabase/functions/send-site-survey/index.ts` — resolve base URL from `app_settings`.
- `src/components/portfolio/SendSurveyDialog.tsx`, `src/components/wp/QueueSurveyDialog.tsx`, `src/components/site/SiteSurveysPanel.tsx` — stop sending origin; new admin actions.
- `src/pages/Admin.tsx` — "Public app base URL" field.
- `src/pages/SurveyForm.tsx` — draft autosave, optional PIN gate, submission reference, robots noindex.
- `src/App.tsx` — no changes (route already public).

**DB (single migration)**
- `app_settings` row `public_app_base_url`.
- `site_surveys` +`revoked_at`,`revoked_by`,`pin_hash`,`opened_at`,`last_saved_at`,`submission_reference`.
- `site_survey_drafts` table + grants + RLS (anon can only upsert via RPC).
- RPCs: `revoke_survey`, `extend_survey`, `resend_survey`, `verify_survey_pin`, `save_survey_draft`, `touch_survey_opened`.
- Update `submit_survey_by_token` to stamp `submission_reference`, complete `survey_alloc` tasks, and upsert `site_stage_status` gate `survey`.

**Storage**
- Tighten `site-surveys` bucket policy: anon INSERT allowed only when path matches `submissions/<token>/*` and the token maps to a `pending`, non-expired, non-revoked survey. File size ≤ 15 MB, MIME whitelist (image/*, application/pdf).

**Testing**
- Playwright incognito on the published domain: valid, expired, revoked, invalid tokens; multi-photo upload; PIN prompt; draft restore; final submit; reopening shows read-only confirmation with reference.

---

Proceed in this order, one phase per turn, stopping after each for review?
