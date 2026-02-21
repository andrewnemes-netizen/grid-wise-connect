

## Gridwise Platform V1 Build Plan

### What Already Exists (Your Foundation)

Your current platform already covers significant ground:
- Authentication and role-based access
- Map with 20+ DNO data layers, postcode search, basemap switching
- Pin drop site intelligence with viability scoring
- Connect tool with route drawing and cable cost estimation
- BOM (Bill of Materials) generation
- Portfolio management with site saving
- PDF export with map screenshots
- LA Programme batch scoring
- Admin panel with layer management and unit rates
- Training guide

### What Needs Building (Prioritised Phases)

---

### PHASE 1: Study System and Rules Engine Foundation

**Goal:** Introduce formal "studies" that persist boundary, route, and results as a single reproducible unit. Add the DNO rules engine framework.

#### 1.1 Studies Database Table

Create a `studies` table to store complete study records:

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| created_by | text | User ID |
| site_id | uuid (nullable) | Link to existing site |
| study_name | text | User-given name |
| mode | text | "connect" or "design" |
| status | text | "draft", "complete", "archived" |
| boundary_geojson | jsonb | Site boundary polygon |
| route_geojson | jsonb | Cable route geometry |
| proposed_kw | numeric | Load demand |
| dno | text | Detected DNO region |
| voltage_level | text | LV/HV/EHV |
| ruleset_version | text | Which ruleset was applied |
| engine_input_json | jsonb | Frozen input snapshot |
| engine_output_json | jsonb | Frozen results snapshot |
| cost_estimate_json | jsonb | Full cost breakdown |
| bom_json | jsonb | Full BOM |
| created_at / updated_at | timestamps | Audit trail |

This gives you reproducible, version-locked studies where every output can be regenerated from the stored input.

#### 1.2 DNO Rulesets (JSON-Driven)

Create a `dno_rulesets` table to store versioned JSON rule sets:

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| dno_code | text | UKPN, NGED, SSEN, SPEN, NPG, ENWL |
| version | text | "v1", "v1.1" etc |
| rules_json | jsonb | Full ruleset |
| is_active | boolean | Current version flag |

Each ruleset JSON contains:
- Duct sizes by voltage level and cable count
- Cover depths by surface type
- Service length caps
- DNO-specific warnings and compliance flags

Seed with a baseline UK ruleset plus 6 DNO-specific overlays.

#### 1.3 Cable Catalogue Table

Create a `cable_catalogue` table:

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| cable_type | text | e.g. "185mm2 4c XLPE" |
| voltage_class | text | LV/HV/EHV |
| impedance_per_km | numeric | For VD calculations |
| current_rating_a | numeric | Iz value |
| cost_per_m | numeric | Material cost |
| diameter_mm | numeric | For duct sizing |
| is_default | boolean | Default selection |

#### 1.4 Studies UI Page

New page `/studies` accessible from sidebar:
- List view of all user studies with status badges
- "New Study" button opens a wizard: name, mode, load
- Links to map for boundary/route drawing
- Study detail page shows frozen results + PDF export

#### 1.5 Rules Engine Edge Function

New edge function `apply-dno-rules` that:
1. Accepts route geometry + DNO code + voltage level
2. Loads the active ruleset for that DNO
3. Returns duct specification, cover depths, warnings, compliance flags
4. Results stored in study's `engine_output_json`

---

### PHASE 2: Enhanced Cost Engine and Price Book

**Goal:** Replace hardcoded unit rates with a versioned, surface-aware price book.

#### 2.1 Price Book Table

Create `price_book` table with versioned line items:
- Surface-type-specific excavation rates (tarmac, concrete, grass, paving)
- Joint allowances per voltage
- Material costs from cable catalogue
- Commercial uplift percentages

#### 2.2 Surface-Aware Cost Calculation

Enhance the existing `connectionCosts.ts` to:
- Accept surface type breakdown from route (currently assumes 60/30/10 split)
- Pull rates from price book instead of unit_rates table
- Generate low/mid/high cost ranges
- Include DNO-specific joint spacing rules

#### 2.3 Enhanced BOQ

Extend `generateBom()` to include:
- Duct specification from rules engine output
- Cover depth requirements
- Joint allowances from DNO rules
- Civils specification line items

---

### PHASE 3: Hybrid LV Optimisation Engine

**Goal:** Automatically find the lowest-cost compliant cable configuration.

#### 3.1 Optimiser Edge Function

New edge function `optimise-lv-hybrid` that:
1. Reads cable catalogue for LV candidates
2. Applies DNO service length cap (default 30m fallback)
3. Iterates mains cable options
4. For each: checks voltage drop < 5%, utilisation, simplified Zs
5. Returns ranked options with cost comparison

#### 3.2 Optimisation Results Panel

New UI panel showing:
- Ranked cable options (cost, VD%, utilisation)
- Recommended option highlighted
- Override capability for engineers

---

### PHASE 4: Electrical Engine (Design Mode)

**Goal:** Add LV radial modelling for ICP-grade validation.

#### 4.1 Electrical Calculation Engine

New edge function `calculate-electrical` that performs:
- Voltage drop calculation (Ib x Zc x L)
- Current validation (Ib < In < Iz)
- Simplified fault level estimate
- Zs gateway check
- Uses configurable defaults: PF=0.95, diversity=1.0, VD limit=5%

#### 4.2 Design Mode Page

New `/design` page with:
- LV radial diagram builder
- Input panels for cable runs, loads, protection devices
- Results showing VD%, utilisation, Zs compliance
- Design PDF export with electrical validation outputs

---

### PHASE 5: Polish and Export

**Goal:** Professional output and version locking.

#### 5.1 Enhanced PDF Export

- Include ruleset version in report header
- Add DNO compliance checklist
- Include optimiser comparison table
- Electrical validation summary (Design mode)
- Map screenshot with route overlay

#### 5.2 JSON Export

- Full study export as JSON for ICP workflow integration
- Importable format for future re-analysis

---

### Recommended Starting Point

**Phase 1 (Studies + Rules Engine)** is the natural next step because:
1. It builds directly on your existing connect/assess workflow
2. It adds persistence (studies are currently lost on page refresh)
3. The rules engine is the foundation everything else depends on
4. It doesn't require any electrical maths yet

### Technical Notes

**Architecture principles from your spec, already followed:**
- All engines will be edge functions (async, no UI blocking)
- Rules/rates/catalogue all JSON-driven and versioned in the database
- No hardcoded duct sizes, cable params, or rates
- Frontend remains React + MapLibre + modular components

**What WON'T change:**
- Existing map tools, scoring, and cost estimation continue working
- Portfolio and LA Programme unaffected
- Auth and role system stays the same

**Database changes required for Phase 1:**
- 3 new tables: `studies`, `dno_rulesets`, `cable_catalogue`
- 1 new edge function: `apply-dno-rules`
- 1 new page: `/studies`
- Sidebar navigation update

Shall I proceed with Phase 1 implementation?

