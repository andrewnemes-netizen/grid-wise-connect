-- Fix infinite recursion: study_shares policies reference studies, and studies policies reference study_shares.
-- Solution: rewrite study_shares policies to NOT reference the studies table (use shared_with/shared_by directly).

-- Drop the problematic policies on study_shares
DROP POLICY IF EXISTS "Owners can manage shares" ON public.study_shares;
DROP POLICY IF EXISTS "Users can view own shares" ON public.study_shares;

-- Recreate study_shares policies WITHOUT referencing the studies table
-- Owners manage shares: use shared_by = auth.uid() instead of joining studies
CREATE POLICY "Owners can manage shares"
  ON public.study_shares FOR ALL
  USING (auth.uid() = shared_by)
  WITH CHECK (auth.uid() = shared_by);

-- Users can view shares where they are the recipient
CREATE POLICY "Users can view own shares"
  ON public.study_shares FOR SELECT
  USING (auth.uid() = shared_with);

-- Now fix the studies "Shared users can view" policy to avoid recursion
-- We use a subquery that won't trigger the study_shares SELECT policy recursively
DROP POLICY IF EXISTS "Shared users can view shared studies" ON public.studies;
DROP POLICY IF EXISTS "Shared editors can update shared studies" ON public.studies;

-- Use a security definer function to break the recursion
CREATE OR REPLACE FUNCTION public.user_has_study_share(_study_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM study_shares
    WHERE study_id = _study_id AND shared_with = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_study_editor_share(_study_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM study_shares
    WHERE study_id = _study_id AND shared_with = _user_id AND role = 'editor'
  );
$$;

-- Recreate studies sharing policies using the security definer functions
CREATE POLICY "Shared users can view shared studies"
  ON public.studies FOR SELECT
  USING (public.user_has_study_share(id, auth.uid()));

CREATE POLICY "Shared editors can update shared studies"
  ON public.studies FOR UPDATE
  USING (public.user_has_study_editor_share(id, auth.uid()));

-- Also fix study_comments policies that reference studies (potential recursion too)
DROP POLICY IF EXISTS "Users can view comments on accessible studies" ON public.study_comments;
DROP POLICY IF EXISTS "Users can add comments on accessible studies" ON public.study_comments;

CREATE OR REPLACE FUNCTION public.user_can_access_study(_study_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM studies WHERE id = _study_id AND created_by = _user_id
  ) OR EXISTS (
    SELECT 1 FROM study_shares WHERE study_id = _study_id AND shared_with = _user_id
  );
$$;

CREATE POLICY "Users can view comments on accessible studies"
  ON public.study_comments FOR SELECT
  USING (public.user_can_access_study(study_id, auth.uid()));

CREATE POLICY "Users can add comments on accessible studies"
  ON public.study_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.user_can_access_study(study_id, auth.uid()));