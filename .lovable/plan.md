## Why the PDF fails to open

The "Open PDF" link on the site dashboard points at a raw Supabase Storage URL on `xqmrnfimcuktyyltikoy.supabase.co`. Chrome ad-blockers (uBlock, Brave shields, corporate DNS filters, etc.) commonly block the `*.supabase.co` host, which produces the `ERR_BLOCKED_BY_CLIENT` page shown in the screenshot. The file isn't missing — the browser refuses to fetch it.

Two things make this worse today:
- `notify-survey-submitted` writes a Storage public/signed URL straight into `site_survey_responses.pdf_url`, so the link is permanently pinned to `supabase.co`.
- Signed URLs also expire, so old survey rows will eventually 400 even when the host isn't blocked.

## Fix: same-origin PDF proxy

Add a small Edge Function that streams the PDF from Storage, and have the UI link at that function instead of at Storage directly. On the published domain the Edge Function is served via `<ref>.lovable.cloud`, which is not on ad-block lists, so the link opens for every user.

### Changes

1. **New Edge Function `survey-pdf`** (`supabase/functions/survey-pdf/index.ts`)
   - `GET /functions/v1/survey-pdf?response_id=<uuid>`
   - Validates the caller with `supabase.auth.getClaims(token)` (Authorization header required).
   - Looks up `site_survey_responses.pdf_storage_path` (+ `site_id`) with the service-role client.
   - Enforces access: user must (a) have a role of admin/engineer, or (b) be a member of the site's project via `project_members`. Reject otherwise with 403.
   - Downloads from the `surveys` bucket with the service client and returns the bytes with `Content-Type: application/pdf` and `Content-Disposition: inline; filename="survey-<id>.pdf"`. Standard `corsHeaders` on every response.

2. **Persist the storage path** (`supabase/functions/notify-survey-submitted/index.ts`)
   - Continue writing `pdf_url` for backward compatibility, but also set `pdf_storage_path` on `site_survey_responses` so the proxy can locate the file without parsing URLs. (Column already exists — verified via schema.)

3. **UI: point the link at the proxy** (`src/components/site/SiteSurveysPanel.tsx`)
   - Replace the `<a href={response.pdf_url}>` with a button that calls the proxy with the current session's access token and opens the returned blob in a new tab (`URL.createObjectURL`). This keeps the request same-origin from the browser's perspective and carries auth without exposing tokens in the URL.
   - Fallback: if `pdf_storage_path` is missing on legacy rows, fall back to the old `pdf_url` link.

4. **No schema migration needed** — `pdf_storage_path` already exists on `site_survey_responses`.

### Out of scope

- No changes to survey submission, external `/survey/:token` flow, or Phase 2/3/4 of the earlier survey plan.
- No changes to the `surveys` bucket's RLS — access stays gated by the proxy, not by public storage rules.

### Verification

- Playwright: sign in, open a site with a completed survey, click "Open PDF", confirm the tab opens the PDF served from `*.lovable.cloud` (not `*.supabase.co`) and that an unauthenticated request to the function returns 401.
