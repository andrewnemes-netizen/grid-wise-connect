DROP TRIGGER IF EXISTS trg_enforce_stage_done_recipient ON public.site_stage_status;
DROP FUNCTION IF EXISTS public.enforce_stage_done_recipient() CASCADE;