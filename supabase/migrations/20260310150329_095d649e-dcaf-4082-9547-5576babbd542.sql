CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));