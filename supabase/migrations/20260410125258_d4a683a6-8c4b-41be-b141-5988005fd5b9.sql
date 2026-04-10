-- =============================================
-- ETAPA 3: projects UPDATE → can_view_project_v2
-- =============================================

DROP POLICY IF EXISTS "Users can update projects" ON public.projects;

CREATE POLICY "Users can update projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (public.can_view_project_v2(auth.uid(), id));

-- =============================================
-- ROLLBACK Etapa 3:
-- =============================================
-- DROP POLICY IF EXISTS "Users can update projects" ON public.projects;
-- CREATE POLICY "Users can update projects"
-- ON public.projects FOR UPDATE TO authenticated
-- USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'arquiteto'::app_role));
