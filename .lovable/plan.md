## Goal
Apply the uploaded `App.tsx` changes while preserving the per-user Outlook routes.

## Changes to `src/App.tsx`
Adopt the uploaded file, but:
- Keep the two Outlook lazy imports (`OutlookConnect`, `OutlookCallback`).
- Keep the `/auth/outlook/callback` and `/account/outlook` routes.
- Keep the `RateCardDetail` lazy import pointing at the current location `./pages/admin/RateCardDetail` (do not move the file).
- Keep the existing `/admin/rate-cards/:versionId` route wrapped in `ProtectedRoute` (matching current file — the uploaded version's extra `Suspense` wrapper is fine; either is acceptable).

Any other diffs between the uploaded file and the current file will be adopted verbatim.

## Verification
Typecheck runs automatically; confirm no route/import breakage.
