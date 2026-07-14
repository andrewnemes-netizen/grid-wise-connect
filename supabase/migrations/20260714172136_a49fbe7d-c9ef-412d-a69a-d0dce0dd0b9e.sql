
-- Sequence used per-org to number invoices
CREATE TABLE public.revenue_invoice_counters (
  org_id uuid PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.revenue_invoice_counters TO authenticated;
GRANT ALL ON public.revenue_invoice_counters TO service_role;
ALTER TABLE public.revenue_invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org read counter" ON public.revenue_invoice_counters FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=revenue_invoice_counters.org_id AND m.user_id=auth.uid()));
CREATE POLICY "org write counter" ON public.revenue_invoice_counters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=revenue_invoice_counters.org_id AND m.user_id=auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=revenue_invoice_counters.org_id AND m.user_id=auth.uid()));

-- Main invoices / payment applications
CREATE TABLE public.revenue_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.revenue_projects(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.revenue_milestones(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  doc_type text NOT NULL DEFAULT 'invoice' CHECK (doc_type IN ('invoice','payment_application')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','certified','paid','rejected')),
  issue_date date DEFAULT CURRENT_DATE,
  due_date date,
  period_from date,
  period_to date,
  po_number text,
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 20,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  certified_amount numeric(14,2),
  certified_date date,
  certified_by uuid,
  paid_amount numeric(14,2),
  paid_date date,
  rejection_reason text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, invoice_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_invoices TO authenticated;
GRANT ALL ON public.revenue_invoices TO service_role;
ALTER TABLE public.revenue_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org read invoices" ON public.revenue_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=revenue_invoices.org_id AND m.user_id=auth.uid()));
CREATE POLICY "org write invoices" ON public.revenue_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=revenue_invoices.org_id AND m.user_id=auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=revenue_invoices.org_id AND m.user_id=auth.uid()));

CREATE INDEX idx_ri_org ON public.revenue_invoices(org_id);
CREATE INDEX idx_ri_project ON public.revenue_invoices(project_id);
CREATE INDEX idx_ri_status ON public.revenue_invoices(org_id, status);

CREATE TRIGGER trg_ri_updated BEFORE UPDATE ON public.revenue_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto invoice number + gross recompute
CREATE OR REPLACE FUNCTION public.revenue_invoice_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE next_seq int;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    INSERT INTO public.revenue_invoice_counters(org_id, last_seq) VALUES (NEW.org_id, 1)
      ON CONFLICT (org_id) DO UPDATE SET last_seq = revenue_invoice_counters.last_seq + 1
      RETURNING last_seq INTO next_seq;
    NEW.invoice_number := 'INV-' || LPAD(next_seq::text, 6, '0');
  END IF;
  IF NEW.due_date IS NULL AND NEW.issue_date IS NOT NULL THEN
    NEW.due_date := NEW.issue_date + INTERVAL '30 days';
  END IF;
  NEW.vat_amount := ROUND(COALESCE(NEW.net_amount,0) * COALESCE(NEW.vat_rate,0) / 100, 2);
  NEW.gross_amount := COALESCE(NEW.net_amount,0) + NEW.vat_amount;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.revenue_invoice_before_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.vat_amount := ROUND(COALESCE(NEW.net_amount,0) * COALESCE(NEW.vat_rate,0) / 100, 2);
  NEW.gross_amount := COALESCE(NEW.net_amount,0) + NEW.vat_amount;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ri_before_insert BEFORE INSERT ON public.revenue_invoices
  FOR EACH ROW EXECUTE FUNCTION public.revenue_invoice_before_insert();
CREATE TRIGGER trg_ri_before_update BEFORE UPDATE ON public.revenue_invoices
  FOR EACH ROW EXECUTE FUNCTION public.revenue_invoice_before_update();

-- Certify / reject / mark paid RPCs
CREATE OR REPLACE FUNCTION public.certify_invoice(_id uuid, _certified_amount numeric, _certified_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.revenue_invoices
  SET status = 'certified',
      certified_amount = COALESCE(_certified_amount, net_amount),
      certified_date = COALESCE(_certified_date, CURRENT_DATE),
      certified_by = auth.uid()
  WHERE id = _id
    AND (public.has_role(auth.uid(),'admin')
         OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_invoices.org_id AND m.user_id = auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_invoice(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.revenue_invoices
  SET status='rejected', rejection_reason=_reason
  WHERE id=_id
    AND (public.has_role(auth.uid(),'admin')
         OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_invoices.org_id AND m.user_id = auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_invoice_paid(_id uuid, _paid_amount numeric, _paid_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record;
BEGIN
  SELECT * INTO inv FROM public.revenue_invoices WHERE id = _id
    AND (public.has_role(auth.uid(),'admin')
         OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_invoices.org_id AND m.user_id = auth.uid()));
  IF inv IS NULL THEN RAISE EXCEPTION 'Not found or not permitted'; END IF;

  UPDATE public.revenue_invoices
  SET status='paid',
      paid_amount = COALESCE(_paid_amount, certified_amount, net_amount),
      paid_date = COALESCE(_paid_date, CURRENT_DATE)
  WHERE id = _id;

  -- Write back to linked milestone actual revenue
  IF inv.milestone_id IS NOT NULL THEN
    UPDATE public.revenue_milestones
    SET actual_revenue = COALESCE(_paid_amount, inv.certified_amount, inv.net_amount)
    WHERE id = inv.milestone_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.certify_invoice(uuid, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid(uuid, numeric, date) TO authenticated;

-- Debtor aging view
CREATE OR REPLACE VIEW public.revenue_debtor_aging
WITH (security_invoker = true) AS
SELECT
  i.id, i.org_id, i.project_id, i.invoice_number, i.doc_type, i.issue_date, i.due_date,
  i.net_amount, i.certified_amount, i.paid_amount, i.status,
  COALESCE(i.certified_amount, i.net_amount) - COALESCE(i.paid_amount, 0) AS outstanding,
  CASE
    WHEN i.status IN ('paid','rejected','draft') THEN 'Cleared'
    WHEN i.due_date IS NULL OR i.due_date >= CURRENT_DATE THEN 'Not Due'
    WHEN CURRENT_DATE - i.due_date <= 30 THEN '0-30'
    WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60'
    ELSE '60+'
  END AS aging_bucket
FROM public.revenue_invoices i;

GRANT SELECT ON public.revenue_debtor_aging TO authenticated;
