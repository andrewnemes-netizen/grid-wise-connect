

## Next Phase: NPG Extraction + Ruleset Versioning + BOQ Code Alignment

Four workstreams building on the proven ENWL reference pattern.

---

### 1. Verify ENWL stored values against engineering basis

Before moving on, confirm these ENWL values are intentionally conservative:
- `headroom_factor: 0.2` (20% headroom buffer -- this is the reinforcement trigger margin)
- `transformer_loading_thresholds.max_loading_pct: 80` (triggers reinforcement above 80%)
- `fault_level_thresholds.minimum_ka: 5` (below 5kA = study required)

No code changes needed -- just a confirmation checkpoint. If any value needs adjustment, update via the Admin UI EV Hub Rules Editor (already built).

---

### 2. Insert NPG DNO-specific ruleset (database)

Insert a new row into `ev_hub_rulesets` with `dno_key = "NPG"`, following the same pattern as ENWL. NPG (Northern Powergrid) operates across Northeast England and Yorkshire.

Fields to populate (HIGH confidence, source "NPG_ICP_SPEC"):
- `lv_max_demand_kva`: 276
- `service_cable_default`: "185mm2 Al Wavecon"
- `lv_main_cables`: ["185mm2 Al", "300mm2 Al"]
- `cover_depths_mm`: { footway: 450, carriageway: 600, verge: 450 }
- `extraneous_distance_threshold_m`: 2.5
- `headroom_factor`: 0.2
- `fault_level_thresholds`: { minimum_ka: 5, maximum_ka: 25 }
- `transformer_loading_thresholds`: { max_loading_pct: 80 }
- `reinforcement_mitigation_sequence`: ["LOAD_MANAGEMENT", "LV_SPLIT", "NEW_TRANSFORMER"]
- `cable_scoring_weights`: { distance: 0.4, capacity: 0.3, age: 0.15, accessibility: 0.15 }
- `protection_grading`: { type: "HRC", rating_a: 315, breaking_capacity_ka: 33 }
- `traffic_management_rules`: { carriageway_requires_tm: true, footway_requires_tm: false }
- `max_service_length_m`: 25

Note: NPG thresholds are very similar to ENWL for the baseline EV hub use case. Any NPG-specific deviations (e.g., different service length cap or fault level range) should be confirmed against NPG ICP specification documents before adjusting.

---

### 3. Add BOQ item code alignment with pricing system

Currently BOQ uses E001-E009 codes. Add a `meta` field to each BOQ item for future rate-card mapping without breaking existing logic.

**BOQ Generator** (`src/lib/evHub/boqGenerator.ts`):
- No structural change to BoqItem type (keep it simple)
- Document the item code mapping in a code comment block at the top of the file for governance:

```
E001 = Service cable run
E002 = LV main cable run  
E003 = Cable termination
E004 = Feeder pillar
E005 = Earthing installation
E006 = CT metering
E007 = LV main cable extension
E008 = Service/main cable joint
E009 = Earthing allowance (non-standard)
```

This is a documentation-only change for now. Full rate-card integration comes later.

---

### 4. Add lightweight ruleset versioning / change log

Add a `ruleset_change_log` table to track who changed what, when, and why. This supports governance without adding complexity to the engine.

**New database table**: `ruleset_change_log`
- `id` (uuid, PK)
- `ruleset_id` (uuid, FK to ev_hub_rulesets.id)
- `changed_by` (uuid)
- `changed_at` (timestamptz, default now())
- `change_type` (text: "CREATE" | "UPDATE" | "DEACTIVATE")
- `previous_version` (text, nullable)
- `new_version` (text)
- `change_summary` (text)
- `diff_json` (jsonb, nullable -- stores field-level diff)

RLS: admins can read/insert, no public access.

**Admin UI** (`src/components/admin/EvHubRulesEditor.tsx`):
- When saving, auto-insert a change log entry with the user ID, change type, and a simple diff (list of changed field keys)
- Add a "Change History" collapsible section below the save button showing recent changes (last 10)
- Bump the version string on save (e.g., "v1" -> "v2", or append timestamp suffix)

---

### 5. Re-test NPG via edge function

After inserting NPG data, re-run the 6-scenario E2E suite with `dno_override: "NPG"`:
- Scenario 1: Should return `LV_OK` (no pending fields)
- Scenario 4: Should show E007 LV main cable extension
- Scenario 2: Should show E009 earthing allowance

---

### 6. Add `max_service_length_m` to admin UI

The EV Hub Rules Editor currently lists 12 rule fields but is missing `max_service_length_m`. Add it to the `RULE_FIELDS` array.

**Admin UI** (`src/components/admin/EvHubRulesEditor.tsx`):
- Add to RULE_FIELDS: `{ key: "max_service_length_m", label: "Max Service Length (m)", type: "number", group: "Electrical" }`

---

### Technical notes

- NPG insertion follows the exact same pattern as ENWL -- just a data INSERT, no schema changes needed for the ruleset itself.
- The change log table is the only schema migration in this phase.
- The "pending -> study required" safety escalation remains untouched. NPG simply populates those fields to HIGH confidence.
- Remaining DNOs (NGED, SSEN, SPEN, UKPN) follow the same extraction pattern in subsequent phases.

