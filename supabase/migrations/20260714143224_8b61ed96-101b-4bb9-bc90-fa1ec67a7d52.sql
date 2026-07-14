
DROP VIEW IF EXISTS public.site_programmes;
DROP VIEW IF EXISTS public.site_milestones;
DROP VIEW IF EXISTS public.site_tasks;

CREATE VIEW public.site_programmes WITH (security_invoker=true) AS
  SELECT * FROM public.projects WHERE site_id IS NOT NULL;
CREATE VIEW public.site_milestones WITH (security_invoker=true) AS
  SELECT * FROM public.project_milestones;
CREATE VIEW public.site_tasks WITH (security_invoker=true) AS
  SELECT * FROM public.project_tasks;

GRANT SELECT ON public.site_programmes TO authenticated;
GRANT SELECT ON public.site_milestones TO authenticated;
GRANT SELECT ON public.site_tasks TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_access_wp(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_wp(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalc_wp_milestone_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_wp(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_wp(uuid, uuid) TO authenticated;
