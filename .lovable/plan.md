## Problem

When a surveyor's submit fails partway (e.g. earlier "permission denied for function submit_survey_by_token"), the storage uploads for signature/photos/PDF have already been written to the `site-surveys` bucket under deterministic paths (`${survey_id}/signature.png`, `${survey_id}/survey.pdf`, `${survey_id}/{fieldKey}/…`). Retrying the submit re-uploads to the same paths with `upsert: false`, so Supabase Storage returns **"The resource already exists"** and the whole submit aborts.

## Fix

Single-file change in `src/pages/SurveyForm.tsx`:

- Change the shared `uploadFile()` helper to use `upsert: true`.
  - Signature and PDF paths are deterministic per survey token — overwriting them on retry is the correct behaviour (latest submit wins).
  - Photo paths already include `Date.now()` and an index, so upsert doesn't cause collisions there; it only helps if a user clicks Submit twice in the same millisecond.
- Regenerate the signed URL after the (re)upload, which the code already does.

No schema, RPC, RLS, or edge function changes. No UX change.

## Verification

After the change:
1. Retry the submit that previously failed for Andrew Nemes — should now succeed and land a fresh row in `site_survey_responses` with a valid `pdf_url` / `pdf_storage_path`.
2. Confirm the owner notification email fires and the PDF is mirrored to OneDrive under `Sites / {Site} / Surveys / …`.

## Out of scope

- No cleanup of orphan files from previous failed attempts (they'll be overwritten on the next submit for that token).
- No change to survey token lifecycle or RPC.
