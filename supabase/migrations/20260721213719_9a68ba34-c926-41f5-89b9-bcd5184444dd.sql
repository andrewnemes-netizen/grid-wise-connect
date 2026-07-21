
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS org_type text NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS org_type_other text;

UPDATE public.organisations SET org_type = 'internal' WHERE slug = 'ecopower';
UPDATE public.organisations SET org_type = 'client' WHERE slug IN ('char-gy','connected-kerb','urban-fox');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_org_type_check'
  ) THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_org_type_check
      CHECK (org_type IN ('client','partner','internal','other'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_org_type_other_required'
  ) THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_org_type_other_required
      CHECK (org_type <> 'other' OR (org_type_other IS NOT NULL AND length(trim(org_type_other)) > 0));
  END IF;
END $$;
