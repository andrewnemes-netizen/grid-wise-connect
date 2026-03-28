

## Fix: Cadent (and future public-portal) Ingestion 401 Errors

### Root Cause

In `supabase/functions/npg-dataset-ingest/index.ts`, lines 127-134:

```typescript
const dnoApiKeyMap: Record<string, string> = {
  NPG: "NPG_API_KEY",
  ENWL: "ENWL_API_KEY",
  SPEN: "SPEN_API_KEY",
  NGED: "NGED_API_KEY",
};
const apiKeyEnvName = dnoApiKeyMap[entry.dno] || "NPG_API_KEY";  // ← CADENT falls through to NPG_API_KEY
const apiKey = Deno.env.get(apiKeyEnvName) || null;
```

When `dno = "CADENT"`, it defaults to `NPG_API_KEY`. That NPG key is then appended to Cadent's URLs (line 862-864 in `fetchWithRetry`), and Cadent's public API rejects it with **401: API key is not valid**.

### Fix

One change in `npg-dataset-ingest/index.ts`:

| Line | Change |
|------|--------|
| 127-134 | Add `UKPN` to the map. For DNOs **not** in the map (like `CADENT`), set `apiKey = null` instead of falling back to `NPG_API_KEY`. This allows public portals to work without authentication. |

Updated code:
```typescript
const dnoApiKeyMap: Record<string, string> = {
  NPG: "NPG_API_KEY",
  ENWL: "ENWL_API_KEY",
  SPEN: "SPEN_API_KEY",
  NGED: "NGED_API_KEY",
  UKPN: "UKPN_API_KEY",
};
const apiKeyEnvName = dnoApiKeyMap[entry.dno] || null;
const apiKey = apiKeyEnvName ? (Deno.env.get(apiKeyEnvName) || null) : null;
```

This means:
- **CADENT, NGN, SGN, WWU** (no entry in map) → `apiKey = null` → no key appended → public API works
- **NPG, ENWL, SPEN, NGED, UKPN** → use their specific API keys as before

### No other changes needed
The crawler (`cadent-catalog-crawler`) already works — it discovered 413 datasets successfully. Only the ingest function needs this one fix.

### After Fix
Go to **Admin → Gas Registry → Cadent Gas** and click **Sync All Active** — datasets should ingest without 401 errors.

