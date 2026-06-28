## Goal
Make it instantly obvious how much spare capacity (headroom) a UKPN Grid/Primary substation has, with proper units.

## Changes (frontend only — `src/components/map/FeatureInfoPanel.tsx`)

1. **Add a "Capacity & Headroom" summary card** at the top of the UKPN Grid & Primary Sites popup, computed from the feature's own attributes (no extra fetch):

   - **Firm capacity (N-1)**: sum of transformer ratings minus the largest one (standard DNO N-1 rule). Shown for both summer and winter.
   - **Peak demand**: `Maxdemandsummer` / `Maxdemandwinter` in MVA.
   - **Headroom (MVA)**: Firm capacity − Peak demand, per season.
   - **Utilisation (%)**: Peak demand ÷ Firm capacity.
   - **RAG badge**: Green <70%, Amber 70–90%, Red >90% (winter, worst case).

   Example for the screenshot site (4× 69.8 MVA winter, peak 47.6 MVA):
   Firm = 3 × 69.8 = 209.4 MVA · Headroom = 161.8 MVA · Utilisation = 23% → Green.

2. **Add unit labels to the generic attribute table** so raw fields are self-explanatory:
   - `maxdemandsummer`, `maxdemandwinter`, `transratingsummer`, `transratingwinter` → suffix **MVA**
   - `assessmentdate`, `next_assessmentdate` → formatted date
   - `siteclassification` → tooltip "UKPN asset condition (Cold = low risk)"
   - Repeating rating lists ("69.8, 69.8, 69.8, 69.8") → render as "4 × 69.8 MVA"

3. **Keep existing LTDS + Connected Circuits sections** below the new summary — no changes to data, RPCs, or ingestion.

## Out of scope
- No schema changes, no edge function changes, no new data sources.
- Secondary substations popup unchanged (no transformer rating fields available).
