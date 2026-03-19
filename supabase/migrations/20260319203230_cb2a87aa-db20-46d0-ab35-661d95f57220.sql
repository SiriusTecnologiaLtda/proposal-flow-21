-- Create a security definer function to check if user is linked ESN
CREATE OR REPLACE FUNCTION public.is_client_esn(_user_id uuid, _esn_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.sales_team st ON lower(st.email) = lower(u.email)
    WHERE u.id = _user_id AND st.id = _esn_id
  )
$$;

-- Fix the policy to use security definer function
DROP POLICY IF EXISTS "Users can update clients" ON public.clients;
CREATE POLICY "Users can update clients"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_client_esn(auth.uid(), esn_id)
  );