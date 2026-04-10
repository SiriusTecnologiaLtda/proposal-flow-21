
-- =============================================
-- Migrate storage.objects project-attachments policies from v1 to v2
-- =============================================

-- 1. SELECT: view project-attachments
DROP POLICY IF EXISTS "Users can view project-attachments they have access to" ON storage.objects;
CREATE POLICY "Users can view project-attachments they have access to"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-attachments'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.project_attachments pa
        JOIN public.projects p ON p.id = pa.project_id
        WHERE pa.file_url LIKE '%' || objects.name || '%'
          AND (p.created_by = auth.uid() OR public.can_view_project_v2(auth.uid(), p.id))
      )
    )
  );

-- 2. INSERT: upload to project-attachments
DROP POLICY IF EXISTS "Users can upload to project-attachments for own projects" ON storage.objects;
CREATE POLICY "Users can upload to project-attachments for own projects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-attachments'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id::text = (storage.foldername(objects.name))[1]
          AND (p.created_by = auth.uid() OR public.can_view_project_v2(auth.uid(), p.id))
      )
    )
  );
