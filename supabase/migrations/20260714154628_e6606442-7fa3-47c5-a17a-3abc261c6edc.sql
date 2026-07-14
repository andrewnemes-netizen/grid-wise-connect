
-- M10: Recipe Library
CREATE TYPE public.recipe_build_type AS ENUM ('horizontal','vertical','buildout','other');

CREATE TABLE public.estimate_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name text NOT NULL,
  build_type public.recipe_build_type NOT NULL DEFAULT 'other',
  socket_count int,
  delivering_partner text,
  version_number int NOT NULL DEFAULT 1,
  status public.rate_card_status NOT NULL DEFAULT 'DRAFT',
  source_workbook text,
  imported_at timestamptz,
  imported_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, name, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_recipes TO authenticated;
GRANT ALL ON public.estimate_recipes TO service_role;
ALTER TABLE public.estimate_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estimate_recipes_staff_all" ON public.estimate_recipes TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE TRIGGER trg_estimate_recipes_updated BEFORE UPDATE ON public.estimate_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_estimate_recipes_contract ON public.estimate_recipes(contract_id);
CREATE INDEX idx_estimate_recipes_status ON public.estimate_recipes(status);

CREATE TABLE public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.estimate_recipes(id) ON DELETE CASCADE,
  rate_item_id uuid REFERENCES public.rate_items(id) ON DELETE SET NULL,
  description_override text,
  unit text NOT NULL DEFAULT 'Per Item',
  default_quantity numeric(14,4) NOT NULL DEFAULT 1,
  quantity_rule_json jsonb NOT NULL DEFAULT '{"type":"FIXED"}'::jsonb,
  quantity_rule_confirmed boolean NOT NULL DEFAULT false,
  markup_amount numeric(14,4) NOT NULL DEFAULT 0,
  markup_pct numeric(9,6),
  stage text,
  cost_code text,
  cost_code_category text,
  is_allowance boolean NOT NULL DEFAULT false,
  related_allowance_ref text,
  create_project_task boolean NOT NULL DEFAULT false,
  task_stage_tag text,
  sort_index int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_items TO authenticated;
GRANT ALL ON public.recipe_items TO service_role;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipe_items_staff_all" ON public.recipe_items TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE TRIGGER trg_recipe_items_updated BEFORE UPDATE ON public.recipe_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_recipe_items_recipe ON public.recipe_items(recipe_id);
CREATE INDEX idx_recipe_items_rate_item ON public.recipe_items(rate_item_id);

-- Immutability guard: no edits/deletes on recipe_items whose recipe is APPROVED
CREATE OR REPLACE FUNCTION public.prevent_approved_recipe_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.rate_card_status;
BEGIN
  SELECT status INTO v_status
  FROM public.estimate_recipes
  WHERE id = COALESCE(NEW.recipe_id, OLD.recipe_id);
  IF v_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Recipe items on an APPROVED recipe are immutable. Create a new DRAFT recipe version instead.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recipe_items_immutable
  BEFORE UPDATE OR DELETE ON public.recipe_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_recipe_item_change();
