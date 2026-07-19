ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS public_app_base_url text;
GRANT SELECT ON public.app_settings TO anon;