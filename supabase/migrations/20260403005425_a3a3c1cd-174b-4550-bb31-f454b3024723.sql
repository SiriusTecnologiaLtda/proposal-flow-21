
-- ===========================================
-- 1. FIX STORAGE POLICIES: project-attachments
-- ===========================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload project attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view project attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to project-attachments for own projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own project-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read project-attachments they have access to" ON storage.objects;

-- Recreate with proper ownership checks
CREATE POLICY "Users can view project-attachments they have access to"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM project_attachments pa
      JOIN projects p ON p.id = pa.project_id
      WHERE pa.file_url LIKE '%' || objects.name || '%'
        AND (p.created_by = auth.uid() OR can_view_project(auth.uid(), p.id))
    )
  )
);

CREATE POLICY "Users can upload to project-attachments for own projects"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (p.created_by = auth.uid() OR can_view_project(auth.uid(), p.id))
    )
  )
);

CREATE POLICY "Users can delete own project-attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR owner = auth.uid()
  )
);

-- ===========================================
-- 2. RESTRICT sync_logs to admin only
-- ===========================================
DROP POLICY IF EXISTS "Authenticated users can view sync logs" ON public.sync_logs;
CREATE POLICY "Admins can view sync logs"
ON public.sync_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- ===========================================
-- 3. RESTRICT sales_targets visibility
-- ===========================================
DROP POLICY IF EXISTS "Authenticated users can view sales targets" ON public.sales_targets;
CREATE POLICY "Users can view relevant sales targets"
ON public.sales_targets FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'gsn'::app_role)
  OR is_client_esn(auth.uid(), esn_id)
);
