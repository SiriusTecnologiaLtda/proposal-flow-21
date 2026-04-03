
DROP POLICY IF EXISTS "Users can view own sw_pdfs" ON storage.objects;
CREATE POLICY "Authenticated users can view sw_pdfs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'software-proposal-pdfs');
