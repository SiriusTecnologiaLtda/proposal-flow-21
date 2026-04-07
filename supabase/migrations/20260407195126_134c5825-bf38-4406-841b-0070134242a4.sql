CREATE POLICY "Authenticated users can read default integration oauth_client_id"
ON public.google_integrations
FOR SELECT
TO authenticated
USING (is_default = true);