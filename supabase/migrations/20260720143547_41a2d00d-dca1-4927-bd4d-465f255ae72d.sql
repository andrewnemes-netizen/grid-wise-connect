-- 1) Snapshot each poc_estimate (with its lines) into deleted_entities
INSERT INTO public.deleted_entities (
  entity_type, entity_id, parent_type, parent_id, snapshot,
  status, reason, archived_at, retention_expires_at
)
SELECT
  'poc_estimate',
  e.id,
  'work_package',
  e.work_package_id,
  jsonb_build_object(
    'estimate', to_jsonb(e),
    'lines', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.sort_index, l.created_at)
      FROM public.poc_estimate_lines l
      WHERE l.poc_estimate_id = e.id
    ), '[]'::jsonb)
  ),
  'archived',
  'retired: PoC now uses Estimates engine',
  now(),
  now() + interval '90 days'
FROM public.poc_estimates e;

-- 2) Drop tables (cascade removes policies, triggers, FKs)
DROP TABLE IF EXISTS public.poc_estimate_lines CASCADE;
DROP TABLE IF EXISTS public.poc_estimates CASCADE;
