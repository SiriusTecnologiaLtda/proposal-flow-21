
-- 1. Fix profiles SELECT: restrict to own row + admin
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Create a safe view for listing profiles (no sensitive fields)
CREATE OR REPLACE VIEW public.profiles_safe AS
  SELECT id, user_id, display_name, email, phone, avatar_url, 
         sales_team_member_id, is_cra, created_at, updated_at
  FROM public.profiles;

-- 3. Make project-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'project-attachments';

-- 4. Tighten storage policies - drop overly permissive ones and add ownership-based
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

-- Storage: admins can do everything, others restricted
CREATE POLICY "Admins full access to project-attachments"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'project-attachments' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'project-attachments' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can read project-attachments they have access to"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-attachments' AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.project_attachments pa
        JOIN public.projects p ON p.id = pa.project_id
        WHERE pa.file_url LIKE '%' || storage.objects.name || '%'
          AND (p.created_by = auth.uid() OR public.can_view_project(auth.uid(), p.id))
      )
    )
  );

CREATE POLICY "Users can upload to project-attachments for own projects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-attachments' AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid() = auth.uid()
    )
  );

CREATE POLICY "Users can delete own project-attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-attachments' AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (owner)::uuid = auth.uid()
    )
  );
