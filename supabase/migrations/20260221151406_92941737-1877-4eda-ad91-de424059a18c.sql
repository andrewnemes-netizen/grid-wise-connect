
-- Study sharing table
CREATE TABLE public.study_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  shared_with uuid NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  shared_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, shared_with)
);

ALTER TABLE public.study_shares ENABLE ROW LEVEL SECURITY;

-- Owner can manage shares on their studies
CREATE POLICY "Owners can manage shares" ON public.study_shares
  FOR ALL USING (
    EXISTS (SELECT 1 FROM studies WHERE studies.id = study_shares.study_id AND studies.created_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM studies WHERE studies.id = study_shares.study_id AND studies.created_by = auth.uid())
  );

-- Users can see shares they received
CREATE POLICY "Users can view own shares" ON public.study_shares
  FOR SELECT USING (auth.uid() = shared_with);

-- Admins can manage all shares
CREATE POLICY "Admins can manage all shares" ON public.study_shares
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Now add shared study access to the studies table
CREATE POLICY "Shared users can view shared studies" ON public.studies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM study_shares WHERE study_shares.study_id = studies.id AND study_shares.shared_with = auth.uid())
  );

CREATE POLICY "Shared editors can update shared studies" ON public.studies
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM study_shares WHERE study_shares.study_id = studies.id AND study_shares.shared_with = auth.uid() AND study_shares.role = 'editor')
  );

-- Study comments table
CREATE TABLE public.study_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  parent_id uuid REFERENCES public.study_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.study_comments ENABLE ROW LEVEL SECURITY;

-- Users can view comments on studies they own or are shared with
CREATE POLICY "Users can view comments on accessible studies" ON public.study_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM studies
      WHERE studies.id = study_comments.study_id
      AND (studies.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM study_shares WHERE study_shares.study_id = studies.id AND study_shares.shared_with = auth.uid()
      ))
    )
  );

-- Users can insert comments on studies they can access
CREATE POLICY "Users can add comments on accessible studies" ON public.study_comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM studies
      WHERE studies.id = study_comments.study_id
      AND (studies.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM study_shares WHERE study_shares.study_id = studies.id AND study_shares.shared_with = auth.uid()
      ))
    )
  );

-- Users can update their own comments
CREATE POLICY "Users can update own comments" ON public.study_comments
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments" ON public.study_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Admins can manage all comments
CREATE POLICY "Admins can manage all comments" ON public.study_comments
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at on comments
CREATE TRIGGER update_study_comments_updated_at
  BEFORE UPDATE ON public.study_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
