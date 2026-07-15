
## Goal

Rework the Site Survey so both the surveyor-facing form and the generated PDF match the structure, field names, and answer format of the example Zoho submission (REF1777 – Carlton Terrace). Current schema is too generic (A–L numeric dims, missing photo groups, missing Zoho-specific questions).

## Gaps vs. example PDF

The example PDF contains many fields we don't currently capture:

**Job Description**
- Site Survey Date (dd-MMM-yyyy HH:MM)
- Site name & Address (pre-filled from site)
- Relevant DNO (with helper link to DNO map)

**EVCP / DNO Info**
- EV Charging Point (Dual) — model name + Quantity
- EV Charging Point (Single) — model name + Quantity
- Total Charge Point Socket Quantity (auto = dual×2 + single)
- Earth Solution (TT / TN-S / Earth Mat etc.) + methodology explanation

**Scenario** — radio: On-Street EVCP / Public Car Park EVCP

**Critical Dimensions (A–I, not A–L)** — each dimension is a *composite* row: `Surface Type` (Footway / Carriageway / Grass / Other) + `Distance (m)` + `Description`, with A and C supporting multiple surface sub-rows that sum to a Total.
- A. POC to FP Distance
- B. Width of Footway (FP side)
- C. Civil Distance FP to EVCPs
- D. Width of Proposed Parking Bay
- E. Total Length of Proposed EV Parking
- F. Length of each EV Parking Bay
- G. Width of Carriageway
- H. Width of Opposite Footway
- I. Datum Point To FP Distance (+ datum description e.g. Lamppost)
- Reference diagram image + guidance link

**Route & Media**
- POC → EVCP satellite view upload (mandatory, annotated dig route)
- What3words for feeder pillar location
- Multiple photo upload groups (5 per group) with per-photo captions
- Excavation Route Hazard Description

**Excavation logistics**
- Road Crossing Excavation Required (Y/N)
- Traffic Management Required (Y/N) + Reason
- Bay Marking Required (Y/N)
- HydroBlasting Required (Y/N)
- Height Restriction (m)

**Site conditions**
- Flood-risk map screenshot upload + Flood Zone (1/2/3)
- Signal test screenshot + speed value + adequate (Y/N)
- Existing signpost present + photo
- Existing Parking Restrictions (details) + summary field
- EV Recharging Point Signs required (Y/N)
- Parking bay suspension required (Y/N)
- Elevation within ±10mm (Y/N)
- Surface Condition (Good/Fair/Poor)
- Asbestos Survey required (Y/N)
- Out of hours (Y/N)
- Additional Hazards (text)
- Extraneous Parts within 2.5m (text)
- ANPR cameras present (Y/N)
- Additional image upload

**Sign Off** — Overall Status, Signature, First Name, Last Name, Email

## Changes

### 1. `src/lib/survey-schema.ts` — rewrite
Extend `FieldType` with `date`, `radio`, `composite_distance` (surface + distance + description; `multi:true` for A and C), and `photo_group` (array of `{file, caption}`). Add all fields above, grouped into 6 sections matching Zoho ordering: Job Description, EVCP & DNO, Scenario, Critical Dimensions, Route & Photos, Site Conditions, Sign Off. Split `submitter_name` into `first_name` + `last_name`.

### 2. `src/pages/SurveyForm.tsx` — extend renderer
Add renderers for the new field types:
- `date` (native `<input type="date">` with time)
- `radio` (shadcn `RadioGroup`)
- `composite_distance` — repeatable rows with Surface select, distance number, description text; auto-total for A and C
- `photo_group` — up to 5 file inputs + caption text per photo, previews, upload to `site-surveys` bucket
- Auto-compute Total Socket Quantity
Reorder wizard steps to match the 6 Zoho sections.

### 3. `src/lib/survey-pdf.ts` — restructure to match example
- Cover: site name & address, survey date, DNO, surveyor
- Section tables that print composite-distance sub-rows the same way Zoho does (Surface / Distance table, then Total row underneath)
- Dedicated "Photos" pages with captions under each image (one per page for satellite view, 2-up for others), matching the example layout
- Signature block at end with printed name + email
- Header "On-Street/Public Car Park Site Survey" on every page

### 4. DB — no schema change required
Response is stored in `site_survey_responses.answers` (jsonb) and photos array — the wider schema is fully backward-compatible; older submissions just render with missing keys as "—".

### 5. Public form defaults
Pre-fill Site name & Address and Relevant DNO from the parent site record so surveyors don't retype them (mirrors the Zoho behaviour where these come from job setup).

## Out of scope
- No changes to invitation flow, tokenised link, or email templates.
- No changes to Portfolio bulk-send UI.
- No new tables/RLS — reusing existing `site_surveys` / `site_survey_responses` / `site-surveys` storage bucket.
