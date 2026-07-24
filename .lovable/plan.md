## Per-line margin editing in QuoteBuilder

Extend the existing `QuoteBuilder` (used for both EV Build and ICP/PoC quotes) so users edit a per-item **Margin %**; the Unit Price is derived from Unit Cost + Margin. The overall quote markup is already shown in the header — relabel it "Overall Margin" and keep it prominent.

### Scope
- File: `src/components/delivery/estimate/QuoteBuilder.tsx` only. No schema changes.
- Applies to both `kind === "build"` and `kind === "poc"` quotes (same component).

### Behaviour
1. Replace the read-only "Unit Price" column with an editable **Margin %** column, keeping the "Unit Price" column as a live-derived, read-only value next to it. Column order:
   `Description | Unit | Award | Unit Cost | Margin % | Unit Price | Qty | Line Cost | Line Price`
2. Margin % is defined as `(price - cost) / cost * 100` (matches the existing header calc). Default per row = current implied margin from the rate card (`(client_unit_price - total_unit_cost)/total_unit_cost * 100`), or 0 when cost is 0.
3. Editing Margin % recomputes Unit Price live: `price = cost * (1 + margin/100)`. Unit Cost stays editable only for `needs_pricing` items (unchanged behaviour).
4. Editing is local to the quote by default — the recomputed price flows into the estimate line's `markup_dollar` on save (already the pattern at lines 241–244), so the rate card itself is not mutated. Exception: for `needs_pricing` items, saving still writes back cost + derived price to `rate_items` (existing pricing-completion path), so the row becomes fully priced.
5. Header stats: rename "Markup" → **Overall Margin** and keep it as the visually dominant stat (larger/accented) alongside Cost, Price, Profit. Award breakdown row stays as-is.

### Technical notes
- Extend `priceEdits` state to carry an optional `marginPct` field alongside `cost`/`price`. Add a `marginOf(it)` selector: if `priceEdits[id].marginPct` is set, use it; else if `priceEdits[id].price` is set derive from that; else derive from rate-card cost/price.
- `priceOf(it)` becomes: if a margin edit exists, `cost * (1 + margin/100)`; otherwise the existing fallback.
- Totals memo unchanged — it already computes markup from cost/price.
- Format margin with 1 decimal; clamp to `>= -100`.
- No new dependencies, no DB migration, no changes to save payload shape beyond the already-derived `markup_dollar`.

### Out of scope
- Persisting per-line margin on `estimate_lines` as its own column (existing `markup_pct` field is 0 by convention; keeping the derived-from-price approach avoids a schema change).
- Changes to PO / rate card / partner logic.
