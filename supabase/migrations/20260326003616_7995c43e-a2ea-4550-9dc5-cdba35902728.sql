
CREATE OR REPLACE FUNCTION public.can_view_project(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = _project_id AND p.created_by = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.sales_team st ON lower(st.email) = lower(u.email)
      JOIN public.projects p ON p.id = _project_id
      WHERE u.id = _user_id AND st.id = p.arquiteto_id
    )
$$;

DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.projects;

CREATE POLICY "Users can view own or linked projects"
ON public.projects
FOR SELECT
TO authenticated
USING (can_view_project(auth.uid(), id));
