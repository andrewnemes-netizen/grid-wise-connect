## End-to-end sweep — findings

I ran a signed-in Playwright sweep across every top-level route and every WP tab, capturing console errors and PostgREST 400 responses.

### What works cleanly (no errors)
- `/` (Map), `/admin`, `/delivery`, `/delivery/projects`, `/delivery/proposals`, `/portfolio`, `/quick-estimate`, `/studies`, `/la-programme`
- WP tabs: **WP Tasks**, **Matrix**, **Master Gantt**
- Recipe Library, Rate Library and the new Variations tables load and grant correctly (verified against the DB — 0 rows so no negative test yet).

### Broken — one root cause, several surfaces

Every 400 seen on the Work Package page comes from the same schema mismatch. The delivery/estimating code queries `sites(name, address)`, but the real table columns are:

```
sites: id, site_name, postcode, proposed_kw, site_type, status, score,
       score_reasons, connection_options, next_steps, created_by,
       client_org, created_at, updated_at, geom, viability_index,
       grid_readiness, deployment_class, cost_band,
       reinforcement_probability, raw_score_data, org_id
```

No `name`, no `address`. PostgREST returns 400 and the panels render empty state (no sites, no included sites, no target list for bulk apply).

### Failing queries (captured URLs)

| WP tab | Failing endpoint |
|---|---|
| Overview / Sites | `wp_sites?select=id,site_id,sequence,local_ref,sites(id,name,address)` |
| Sites (Add site picker) | `sites?select=id,name,address&order=created_at.desc&limit=500` |
| Site estimates | `wp_sites?select=id,site_id,sequence,sites(id,name,address)` |
| Estimate | `wp_estimate_sites?select=*,sites(name,address),site_estimates(name,version_number,status)` |

### Files to fix

1. `src/pages/DeliveryWorkPackage.tsx` — lines 40, 201, 231, 252, 254, 500, 558
2. `src/components/delivery/SiteEstimatesPanel.tsx` — lines 40, 143–144, 768, 843–844 (and the new BulkApplyRecipeDialog it feeds)
3. `src/components/delivery/WpEstimatePanel.tsx` — lines 184, 236–237, 457, 646–647
4. `src/pages/DeliveryProposalDetail.tsx` — line 36 embed, line 139 render

### Fix approach

Replace every `sites(...name...address...)` embed and every `sites.select("id,name,address")` with the real columns, and update UI readers to match. Two viable shapes:

- **Minimal** (recommended, no schema change): select `sites(id, site_name, postcode)` and read `sites?.site_name` and `sites?.postcode` in the UI. Preserves the existing DB and matches the rest of the app (Portfolio, Studies, LA Programme all use `site_name`/`postcode`).
- **Alternative**: add generated columns / a view aliasing `name`/`address` — heavier, unnecessary.

Going with the minimal approach.

### Concrete edits

- Change every embed to `sites(id, site_name, postcode)`.
- Change every read to `sites?.site_name ?? "Site"` and `sites?.postcode ?? ""` (labelled "Postcode" in the muted secondary line).
- In the "Add site" picker (`DeliveryWorkPackage.tsx:201`), select `id, site_name, postcode` and render `{s.site_name} {s.postcode ? "— " + s.postcode : ""}`.
- In `WpEstimateVariations` no changes needed (does not touch `sites`).

### Non-issues / false positives to note

- `/delivery/programmes` 404 was my Playwright typo — the real route is `/delivery`. App routing is fine.
- The "Function Search Path Mutable" linter warnings after the last migration are pre-existing across the project (100 total) and unrelated — my new functions already set `search_path = public`.

### Verification after fix

Re-run the same Playwright sweep and confirm:
- Zero 4xx responses on WP Overview, Sites, Site estimates, Estimate tabs.
- Sites list on WP renders `site_name` + postcode.
- Bulk-apply-recipe dialog shows the WP's sites and lets me tick them.

### Not covered by this pass (want a follow-up sweep?)

- Recipe / Rate Library create → approve → clone happy paths (needs seed data, would mutate).
- WP Estimate approve → raise Variation → submit → approve delta rollup (needs an approved WP estimate; safe to do after the sites fix so the UI is usable).
- Map layers, EV Hub engine, PDF export — not touched by recent work; can sweep separately if you want.
