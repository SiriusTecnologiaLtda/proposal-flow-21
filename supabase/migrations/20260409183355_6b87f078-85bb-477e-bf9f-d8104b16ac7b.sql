-- Drop the admin-only insert policy
DROP POLICY IF EXISTS "Admins can insert clients" ON public.clients;

-- Allow any authenticated user to insert clients
CREATE POLICY "Authenticated users can insert clients"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (true);