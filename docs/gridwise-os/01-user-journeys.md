# 01 — End-to-End User Journeys

Twelve canonical flows. Each names the actor, entry point, existing modules reused, and the terminal state. No new modules are introduced.

---

## J1. Client enquiry → award
**Actor:** Sales/PM · **Entry:** `/wp/new` (WP shell) · **Reuses:** existing `proposals`, `estimates`, `clients`.
1. Create Client (if new) → Programme → WP (status `opportunity`).
2. Attach opportunity estimate (`estimates.wp_id` nullable).
3. Send proposal (existing `send-quotation`).
4. Client PO received → `estimates.status = awarded` → baseline snapshot fires (P4).

## J2. Portfolio import → Programme/WP/Sites
**Actor:** PM · **Entry:** WP → Sites → Import, or Portfolio → Import · **Reuses:** existing `ImportWizard`.
1. Upload XLSX/CSV/PDF → auto-map columns → validate → geocode → map preview.
2. Pick or create Client/Programme/WP → approve.
3. Sites appear in Portfolio, WP → Sites, GIS Map, Site Register simultaneously.
4. Optional: batch Gridwise Connect run on selected sites (existing `score-sites-batch`).

## J3. Site import → Connect → Design
**Actor:** Engineer · **Entry:** WP → Sites → row → Run Connect.
1. `runGridwiseProject` executes for site.
2. Result linked to site via new `studies.site_id/wp_id`.
3. "Convert to Design" opens existing Design Mode with scenario seeded from Connect output.

## J4. Design submission → DNO
**Actor:** Engineer → Partner (optional) · **Entry:** WP → Engineering → Design.
1. Partner (or internal) uploads design pack → `design_submissions` row + files via `project_files`.
2. Internal review → `design_reviews`.
3. On approval → workflow: sites → `ready_for_delivery`, `wp_procurement_unlocked=true`, delivery PM notified. **No duplicate Delivery project.**

## J5. DNO offer → commercial review → PO
**Actor:** Commercial · **Entry:** WP → Engineering → DNO Offers.
1. Log offer → `dno_offers` + `dno_offer_sites` + files in `project_files`.
2. Commercial reviews margin (internal lens).
3. Client PO logged → `purchase_orders` + `po_lines` + `po_line_sites`. `v_po_commitments` view refreshes live.

## J6. Partner allocation → portal handoff
**Actor:** Delivery PM · **Entry:** WP → Delivery → Partners.
1. Allocate partner to WP (and optionally site subset) via `wp_partner_allocations`.
2. Partner user signs in at `/partner/*` → sees only allocated sites, partner-lens commercials.

## J7. Programme build → tasks + gates
**Actor:** Delivery PM · **Entry:** WP → Delivery → Programme.
1. Apply programme template (existing `programme_templates`).
2. Adds WP-level tasks (`wp_tasks`, scope=wp_level) and site-level tasks (`project_tasks`, scope=site_level).
3. Milestone gates set (`gate_type`); dependent tasks blocked until gate met.

## J8. Resource assignment
**Actor:** Delivery PM · **Entry:** WP → Delivery → Resources.
1. Assign gang/jointer/PM/vehicle to task or WP window.
2. Conflict detector rejects double-booking against `resource_calendars`.

## J9. Mobilisation → construction control
**Actor:** Site supervisor · **Entry:** WP → Records.
1. Upload permits, TM plan, RAMS; site stage advances via `stage_transition_rules`.
2. Daily logs, photos (EXIF geo), inspections, materials delivered.
3. RAMS-missing site cannot enter `mobilised` (rule enforced).

## J10. Variation → PO amendment
**Actor:** Commercial · **Entry:** WP → Commercial → Variations.
1. Raise variation (existing `wp_estimate_variations`).
2. Client approves → variation-line rolls into `v_wp_commercial_position` and updates remaining PO balance.

## J11. Commissioning → handover
**Actor:** Commissioning engineer · **Entry:** Site drawer → Commissioning.
1. Energisation logged (`commissioning_records`) → stage `energised`.
2. Test certs uploaded, snags closed → `practical_completion`.
3. O&M pack generated → `handover_complete` → `closed`. Client sign-off email captured.

## J12. Reporting / assistant query
**Actor:** Any role · **Entry:** Assistant chat or Reports tab.
1. Ask "status of WP-123" → assistant calls read-only MCP tools (Phase 12).
2. Generate audience-specific PDF (client/DNO/installer) via existing PDF pipeline.

---

**Sign-off:** Product ☐  Delivery ☐  Engineering ☐