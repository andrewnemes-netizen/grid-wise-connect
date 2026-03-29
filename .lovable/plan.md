

## Fix Gas Registry Table + Sync Status Tracking

### Problem 1: Gas Registry Table Missing
The `gas_dataset_registry` table was never created. The Gas Registry admin tab queries a non-existent table, showing 0 datasets. Cadent's 413 datasets currently live in `dno_dataset_registry`.

### Problem 2: Sync Status Never Updated to "synced"
After successful ingestion, `last_sync_status` is not being set to `"synced"` — it stays null or only gets set on errors. The Layers tab shows real feature counts (Cadent LP: 10,000; ENWL Capacity: 1,808) but the registry shows 0 synced.

### Solution

| # | Change | Detail |
|---|--------|--------|
| 1 | **Create `gas_dataset_registry` table** via migration | Identical schema to `dno_dataset_registry`. Add RLS policies for admin access. |
| 2 | **Migrate Cadent rows** | Move all 413 CADENT rows from `dno_dataset_registry` to `gas_dataset_registry` in the same migration. |
| 3 | **Update `GasDatasetRegistry.tsx`** | Change query to read from `gas_dataset_registry` instead of `dno_dataset_registry`. |
| 4 | **Update `npg-dataset-ingest` edge function** | After successful batch insert, set `last_sync_status = 'synced'` and `last_sync_rows` on the registry entry. Currently only errors update the status. |
| 5 | **Update `cadent-catalog-crawler`** | Write discovered datasets to `gas_dataset_registry` instead of `dno_dataset_registry`. |
| 6 | **Update `auto_create_dno_layers` RPC** | Support reading from `gas_dataset_registry` when called for gas operators. |

### Technical Detail

**Migration SQL:**
```sql
-- Create gas_dataset_registry (same schema as dno_dataset_registry)
CREATE TABLE public.gas_dataset_registry (LIKE public.dno_dataset_registry INCLUDING ALL);

-- Move Cadent rows
INSERT INTO public.gas_dataset_registry SELECT * FROM public.dno_dataset_registry WHERE dno = 'CADENT';
DELETE FROM public.dno_dataset_registry WHERE dno = 'CADENT';

-- RLS
ALTER TABLE public.gas_dataset_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage gas registry" ON public.gas_dataset_registry
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read gas registry" ON public.gas_dataset_registry
  FOR SELECT TO authenticated USING (true);
```

**Sync status fix** in `npg-dataset-ingest/index.ts` — after successful feature insertion, add:
```typescript
await supabase.from(registryTable).update({
  last_sync_status: "synced",
  last_sync_rows: totalInserted,
  last_sync_at: new Date().toISOString(),
  last_sync_error: null,
}).eq("id", entry.id);
```

Where `registryTable` is determined by whether the operator is a gas GDN or electricity DNO.

### Expected Outcome
- Gas Registry tab shows 413 Cadent datasets with correct sync status
- DNO Registry no longer contains Cadent rows
- After running Sync All Active, successfully ingested datasets show "synced" status with row counts

