
-- M9: Rate Library foundation
CREATE TYPE public.rate_card_status AS ENUM ('DRAFT','APPROVED','SUPERSEDED');
CREATE TYPE public.rate_provided_by AS ENUM ('partner','client','both','unknown');

-- contracts
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  currency text NOT NULL DEFAULT 'GBP',
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts_staff_all" ON public.contracts TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_contracts_client ON public.contracts(client_id);

-- rate_cards
CREATE TABLE public.rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_cards TO authenticated;
GRANT ALL ON public.rate_cards TO service_role;
ALTER TABLE public.rate_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_cards_staff_all" ON public.rate_cards TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE TRIGGER trg_rate_cards_updated BEFORE UPDATE ON public.rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_rate_cards_contract ON public.rate_cards(contract_id);

-- rate_card_versions
CREATE TABLE public.rate_card_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id uuid NOT NULL REFERENCES public.rate_cards(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  effective_from date,
  effective_to date,
  status public.rate_card_status NOT NULL DEFAULT 'DRAFT',
  source_workbook text,
  imported_at timestamptz,
  imported_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rate_card_id, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_card_versions TO authenticated;
GRANT ALL ON public.rate_card_versions TO service_role;
ALTER TABLE public.rate_card_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_card_versions_staff_all" ON public.rate_card_versions TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE TRIGGER trg_rate_card_versions_updated BEFORE UPDATE ON public.rate_card_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_rate_card_versions_card ON public.rate_card_versions(rate_card_id);

-- rate_items
CREATE TABLE public.rate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_version_id uuid NOT NULL REFERENCES public.rate_card_versions(id) ON DELETE CASCADE,
  rate_code text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'Per Item',
  labour_cost numeric(14,4),
  material_cost numeric(14,4),
  plant_cost numeric(14,4),
  subcontract_cost numeric(14,4),
  total_unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  client_unit_price numeric(14,4),
  cost_split_available boolean NOT NULL DEFAULT false,
  needs_pricing boolean NOT NULL DEFAULT false,
  category text,
  cost_code text,
  cost_code_category text,
  provided_by public.rate_provided_by NOT NULL DEFAULT 'unknown',
  notes text,
  source_sheet text,
  source_ser text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rate_card_version_id, rate_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_items TO authenticated;
GRANT ALL ON public.rate_items TO service_role;
ALTER TABLE public.rate_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_items_staff_all" ON public.rate_items TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE TRIGGER trg_rate_items_updated BEFORE UPDATE ON public.rate_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_rate_items_version ON public.rate_items(rate_card_version_id);
CREATE INDEX idx_rate_items_code ON public.rate_items(rate_code);

-- Immutability guard: no edits/deletes on rate_items belonging to an APPROVED version
CREATE OR REPLACE FUNCTION public.prevent_approved_rate_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.rate_card_status;
BEGIN
  SELECT status INTO v_status
  FROM public.rate_card_versions
  WHERE id = COALESCE(NEW.rate_card_version_id, OLD.rate_card_version_id);
  IF v_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Rate items on an APPROVED rate card version are immutable. Create a new DRAFT version instead.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_rate_items_immutable
  BEFORE UPDATE OR DELETE ON public.rate_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_rate_item_change();
