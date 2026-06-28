
## Context

The monthly circuit operational data we ingested is UKPN data (licence area SPN — South Eastern Power Networks, one of UKPN's three areas, alongside EPN and LPN). The popup lookup wired to UKPN substations is therefore correct.

The only issue is naming: the storage table and RPC were created under an `npg_` prefix from an earlier draft. That makes the schema misleading and risks the same confusion recurring later (and blocks ever adding real NPG circuit data alongside it).

## What changes

Rename only — no data loss, no behaviour change.

1. **Database**
   - Rename table `public.npg_circuit_monthly` → `public.ukpn_circuit_monthly`.
   - Rename view `public.npg_circuit_latest_utilisation` → `public.ukpn_circuit_latest_utilisation` (recreate against new table).
   - Replace RPC `public.npg_circuits_for_substation(text)` with `public.ukpn_circuits_for_substation(text)` pointing at the new table. Drop the old one.
   - Re-apply GRANTs and RLS policies on the renamed objects.

2. **Edge function**
   - Rename `supabase/functions/ukpn-circuit-monthly-ingest` is already correctly named; update its internal `from("npg_circuit_monthly")` references to `ukpn_circuit_monthly`.

3. **Frontend**
   - `src/components/map/FeatureInfoPanel.tsx`: swap RPC name from `npg_circuits_for_substation` to `ukpn_circuits_for_substation`, and update the source caption to "UKPN monthly circuit operational data (132 / 33 kV)".

## Out of scope

- No re-ingest — existing rows are kept as-is.
- No change to LTDS tables or to the substation popup layout.
- No actual NPG (Northern Powergrid) ingest yet; if you want NPG circuits later, that's a separate task with its own table.

## Technical notes

- Postgres `ALTER TABLE ... RENAME TO` preserves data, indexes, constraints, and RLS, so the rename is safe.
- Views and functions reference the old name by parse-time resolution, so the view and RPC must be dropped and recreated against the new table in the same migration.
