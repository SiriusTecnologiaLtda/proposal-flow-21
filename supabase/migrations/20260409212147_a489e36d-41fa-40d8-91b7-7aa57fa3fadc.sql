
-- =============================================
-- PROJECTS: Migrate SELECT to can_view_project_v2
-- =============================================

-- 1. projects table
DROP POLICY IF EXISTS "Users can view own or linked projects" ON public.projects;
CREATE POLICY "Users can view own or linked projects"
ON public.projects
FOR SELECT
TO authenticated
USING (public.can_view_project_v2(auth.uid(), id));

-- 2. project_scope_items: restrict SELECT to project visibility
DROP POLICY IF EXISTS "Authenticated users can view project scope" ON public.project_scope_items;
CREATE POLICY "Authenticated users can view project scope"
ON public.project_scope_items
FOR SELECT
TO authenticated
USING (public.can_view_project_v2(auth.uid(), project_id));

-- 3. project_attachments: restrict SELECT to project visibility
DROP POLICY IF EXISTS "Authenticated users can view project attachments" ON public.project_attachments;
CREATE POLICY "Authenticated users can view project attachments"
ON public.project_attachments
FOR SELECT
TO authenticated
USING (public.can_view_project_v2(auth.uid(), project_id));

-- =============================================
-- ROLLBACK (keep as reference):
-- =============================================
-- DROP POLICY IF EXISTS "Users can view own or linked projects" ON public.projects;
-- CREATE POLICY "Users can view own or linked projects"
-- ON public.projects FOR SELECT TO authenticated
-- USING (public.can_view_project(auth.uid(), id));
--
-- DROP POLICY IF EXISTS "Authenticated users can view project scope" ON public.project_scope_items;
-- CREATE POLICY "Authenticated users can view project scope"
-- ON public.project_scope_items FOR SELECT TO authenticated
-- USING (true);
--
-- DROP POLICY IF EXISTS "Authenticated users can view project attachments" ON public.project_attachments;
-- CREATE POLICY "Authenticated users can view project attachments"
-- ON public.project_attachments FOR SELECT TO authenticated
-- USING (true);
