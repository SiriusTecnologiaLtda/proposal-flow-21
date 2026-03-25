
INSERT INTO storage.buckets (id, name, public) VALUES ('project-attachments', 'project-attachments', true);

CREATE POLICY "Authenticated users can upload project attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-attachments');
CREATE POLICY "Authenticated users can view project attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-attachments');
CREATE POLICY "Authenticated users can delete project attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-attachments');
