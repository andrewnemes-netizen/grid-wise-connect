## Plan: remove the remaining survey “resource already exists” failure

I checked the current survey submission flow. The photo/signature/PDF uploads in `SurveyForm.tsx` now use overwrite mode, so the remaining conflict is likely from the storage policy not allowing overwrite/update for anonymous survey submitters even though insert/upload is allowed.

### What I will change

1. **Keep the existing survey UX unchanged**
   - No dialog/page redesign.
   - No change to survey questions, PDF generation, or submission flow.

2. **Make survey file overwrite actually work for external survey links**
   - Add a small backend migration for the `site-surveys` storage bucket policies.
   - Ensure anonymous token-based survey submitters can update existing objects in `site-surveys`, not just create them.
   - Keep access scoped to the survey bucket only.

3. **Keep the existing retry behaviour**
   - If a first submit partially uploaded files and then failed, the retry should replace stale files instead of failing with `resource already exists`.

4. **Verify the affected code path**
   - Confirm `SurveyForm.tsx` still calls upload with overwrite enabled.
   - Confirm no UX or behaviour changes outside the upload conflict fix.

### Expected result

When you retry the same survey submission after a partial failure, it should continue through upload, save the survey response, generate/register the PDF, and notify the owner instead of stopping at `resource already exists`.