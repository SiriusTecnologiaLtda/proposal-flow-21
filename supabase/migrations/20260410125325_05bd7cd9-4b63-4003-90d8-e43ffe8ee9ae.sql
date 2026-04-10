-- =============================================
-- ETAPA 4: Project child tables write → can_view_project_v2
-- =============================================

-- ---- project_scope_items ----
DROP POLICY IF EXISTS "Authorized users can insert project scope" ON public.project_scope_items;
CREATE POLICY "Authorized users can insert project scope"
ON public.project_scope_items FOR INSERT TO authenticated
WITH CHECK (public.can_view_project_v2(auth.uid(), project_id));

DROP POLICY IF EXISTS "Authorized users can update project scope" ON public.project_scope_items;
CREATE POLICY "Authorized users can update project scope"
ON public.project_scope_items FOR UPDATE TO authenticated
USING (public.can_view_project_v2(auth.uid(), project_id));

DROP POLICY IF EXISTS "Authorized users can delete project scope" ON public.project_scope_items;
CREATE POLICY "Authorized users can delete project scope"
ON public.project_scope_items FOR DELETE TO authenticated
USING (public.can_view_project_v2(auth.uid(), project_id));

-- ---- project_attachments ----
DROP POLICY IF EXISTS "Authorized users can insert project attachments" ON public.project_attachments;
CREATE POLICY "Authorized users can insert project attachments"
ON public.project_attachments FOR INSERT TO authenticated
WITH CHECK (public.can_view_project_v2(auth.uid(), project_id));

DROP POLICY IF EXISTS "Authorized users can update project attachments" ON public.project_attachments;
CREATE POLICY "Authorized users can update project attachments"
ON public.project_attachments FOR UPDATE TO authenticated
USING (public.can_view_project_v2(auth.uid(), project_id));

DROP POLICY IF EXISTS "Authorized users can delete project attachments" ON public.project_attachments;
CREATE POLICY "Authorized users can delete project attachments"
ON public.project_attachments FOR DELETE TO authenticated
USING (public.can_view_project_v2(auth.uid(), project_id));

-- =============================================
-- ROLLBACK Etapa 4:
-- =============================================
-- Pattern was: admin OR (EXISTS projects WHERE created_by = auth.uid())
-- DROP + CREATE for each of the 6 policies above reverting to created_by check.
