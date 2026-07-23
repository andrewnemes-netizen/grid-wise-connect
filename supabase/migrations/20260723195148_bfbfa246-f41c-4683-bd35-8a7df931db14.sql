
-- Tables
CREATE TABLE public.poc_designer_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','expired','revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  submitted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_poc_returns_po ON public.poc_designer_returns(po_id);
CREATE INDEX idx_poc_returns_token ON public.poc_designer_returns(token);
CREATE INDEX idx_poc_returns_status ON public.poc_designer_returns(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poc_designer_returns TO authenticated;
GRANT ALL ON public.poc_designer_returns TO service_role;
ALTER TABLE public.poc_designer_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage poc returns" ON public.poc_designer_returns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));
CREATE TRIGGER trg_poc_returns_updated BEFORE UPDATE ON public.poc_designer_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.poc_designer_return_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.poc_designer_returns(id) ON DELETE CASCADE,
  file_type text NOT NULL CHECK (file_type IN ('pdf','xlsx')),
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  parsed_content jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_poc_return_files_return ON public.poc_designer_return_files(return_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poc_designer_return_files TO authenticated;
GRANT ALL ON public.poc_designer_return_files TO service_role;
ALTER TABLE public.poc_designer_return_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view poc return files" ON public.poc_designer_return_files FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "Staff delete poc return files" ON public.poc_designer_return_files FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

CREATE TABLE public.poc_designer_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.poc_designer_returns(id) ON DELETE CASCADE,
  rate_code text,
  description text,
  designer_cost numeric(14,4),
  source_file_id uuid REFERENCES public.poc_designer_return_files(id) ON DELETE SET NULL,
  extraction_confidence numeric,
  reviewed boolean NOT NULL DEFAULT false,
  reviewer_id uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  confirmed_unit_cost numeric(14,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_poc_return_lines_return ON public.poc_designer_return_lines(return_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.poc_designer_return_lines TO authenticated;
GRANT ALL ON public.poc_designer_return_lines TO service_role;
ALTER TABLE public.poc_designer_return_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage poc return lines" ON public.poc_designer_return_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));
CREATE TRIGGER trg_poc_return_lines_updated BEFORE UPDATE ON public.poc_designer_return_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public RPCs
CREATE OR REPLACE FUNCTION public.get_poc_return_by_token(_token text)
RETURNS TABLE (
  return_id uuid, po_id uuid, po_number text, status text,
  expires_at timestamptz, work_package_name text, client_name text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.po_id, po.po_number, r.status, r.expires_at,
    COALESCE(wp.name, wp.code)::text,
    c.name
  FROM public.poc_designer_returns r
  JOIN public.purchase_orders po ON po.id = r.po_id
  LEFT JOIN public.work_packages wp ON wp.id = po.work_package_id
  LEFT JOIN public.clients c ON c.id = po.client_id
  WHERE r.token = _token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_poc_return_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_poc_return_by_token(
  _token text, _files jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_return public.poc_designer_returns%ROWTYPE;
  v_file jsonb;
BEGIN
  SELECT * INTO v_return FROM public.poc_designer_returns
  WHERE token = _token AND status = 'pending' AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired or already-submitted return token';
  END IF;
  IF _files IS NULL OR jsonb_array_length(_files) = 0 THEN
    RAISE EXCEPTION 'At least one file is required';
  END IF;
  FOR v_file IN SELECT * FROM jsonb_array_elements(_files) LOOP
    INSERT INTO public.poc_designer_return_files (
      return_id, file_type, storage_path, original_filename, parsed_content
    ) VALUES (
      v_return.id,
      v_file->>'file_type',
      v_file->>'storage_path',
      v_file->>'original_filename',
      COALESCE(v_file->'parsed_content', 'null'::jsonb)
    );
  END LOOP;
  UPDATE public.poc_designer_returns
     SET status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = v_return.id;
  RETURN v_return.id;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_poc_return_by_token(text, jsonb) TO anon, authenticated;

-- Storage policies (bucket already created)
CREATE POLICY "Anon upload poc returns" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'poc-designer-returns');
CREATE POLICY "Staff read poc returns" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'poc-designer-returns'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  );
CREATE POLICY "Staff delete poc returns" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'poc-designer-returns'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  );
