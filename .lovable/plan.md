
# E2E test plan — full pre-construction workflow with screenshots

I'm in plan mode, so I can't run mutating SQL or Playwright interactions yet. Here's exactly what I'll execute the moment you approve.

## Scope
Walk one synthetic Work Package through every pre-construction stage and capture a screenshot at each checkpoint.

## Test harness
- Playwright (headless Chromium, 1280×1800) driving `http://localhost:8080`
- Managed Supabase session restored from env
- Direct SQL via `supabase--insert` for webhook-style events (DNO offer, survey, design, RAMS)
- All test rows tagged `metadata_json.e2e_run_id = <uuid>` for cleanup at the end

## Steps and screenshots

```text
 #  Action                                                Screenshot
 -  -----------------------------------------------------  ---------------------------
 1  Create WP "E2E Precon Run" with 2 sites               01_wp_created.png
 2  Open Site Register tab                                02_site_register_empty.png
 3  Insert DNO offer linked to site A via dno_offer_sites 03_dno_offer_created.png
 4  Verify POC gate = passed, estimate task auto-created  04_gates_after_poc.png
 5  Set site_estimates.status='approved' for site A       05_estimate_approved.png
 6  Client-decision dialog: accept                        06_client_accept.png
 7  Insert design_submissions (EV) approved for site A    07_design_ev_approved.png
 8  Insert design_submissions (ICP) approved for site A   08_design_icp_approved.png
 9  Insert rams_documents status='approved' for site A    09_rams_approved.png
10  Verify final_review auto-passed → site released       10_site_released.png
11  Open Site Readiness dashboard                         11_readiness_dashboard.png
12  Bulk-release path: repeat 3–9 for site B, then use    12_bulk_release.png
    multi-select "Release to delivery"
13  Open Notifications bell                               13_notifications.png
14  Click a notification → deep-link lands correctly      14_deeplink_target.png
15  Idempotency: re-fire the DNO offer webhook, re-fire   15_idempotency_counts.png
    design approval; assert task/gate counts unchanged
16  Cleanup: delete all e2e_run_id rows                   (no screenshot)
```

## Assertions
- After step 4: exactly one `wp_tasks` row (estimate task) with `metadata_json->>'source' = 'dno_offer'`; `site_precon_gates.poc = passed`.
- After step 9: `site_precon_gates.final_review = passed`, `sites.status` moved to delivery-ready stage.
- After step 15: repeat-insert produces zero new tasks and zero new gate rows.
- Every screenshot rendered without console errors (`page.on('console')` captured to `/tmp/browser/console.log`).

## Deliverables
- All 15 screenshots in `/mnt/documents/e2e-precon/` (inline gallery in the reply).
- A short pass/fail summary per assertion.
- Console/network error log if anything failed.

## Why I need your OK
The test inserts, updates, and deletes rows in `dno_offers`, `dno_offer_sites`, `site_estimates`, `design_submissions`, `rams_documents`, `wp_tasks`, `site_precon_gates`, `sites`, and `work_packages`. It's fully self-cleaning (step 16), but it does mutate live data during the run.

Approve and I'll execute end-to-end and post the gallery.
