

## Admin Panel Cleanup

### Changes

**1. Rename "NPG Registry" → "DNO Registry"**
- Update tab label and icon in `Admin.tsx`
- Update heading/description inside `NpgDatasetRegistry.tsx`

**2. Repurpose "API Sources" → "External APIs"**
- Remove DNO entries (NPG, UKPN, NGED, SPEN, SSEN, ENWL) from the hardcoded `DNO_REGISTRY` in `DnoApiSources.tsx` — these are now managed via DNO Registry
- Keep/add non-DNO sources: DfT Road Traffic, NaPTAN, Stats19, OS Features, Land Registry, Planning Data
- Rename tab label to "External APIs" with appropriate icon
- Rename component heading

**3. Remove "Site Data" tab**
- Remove the `DataUploader` tab from `Admin.tsx`
- Keep `DataUploader.tsx` file for now (no deletion) in case the spreadsheet import logic is needed later

**4. Reorder tabs logically**
```
Layers | Unit Rates | EV Hub Rules | DNO Registry | External APIs | Users & Roles | Audit Log
```

### Files to Change

| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Remove Site Data tab, rename NPG Registry → DNO Registry, rename API Sources → External APIs, reorder tabs |
| `src/components/admin/NpgDatasetRegistry.tsx` | Update title/description text from "NPG" to "DNO Dataset Registry" |
| `src/components/admin/DnoApiSources.tsx` | Remove DNO entries from hardcoded registry, add non-DNO external API sources (DfT, NaPTAN, Stats19, OS, Land Registry, Planning) |

