
-- =============================================
-- Replace is_client_esn with structural is_member_match
-- =============================================

-- 1. Create structural function
CREATE OR REPLACE FUNCTION public.is_member_match(_user_id uuid, _member_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.sales_team_member_id = _member_id
  )
$$;

COMMENT ON FUNCTION public.is_member_match(uuid, uuid) IS 
  'Structural replacement for is_client_esn. Checks if user is linked to a sales team member via profiles.sales_team_member_id.';

-- 2. Replace clients UPDATE policy
DROP POLICY IF EXISTS "Users can update clients" ON public.clients;
CREATE POLICY "Users can update clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_member_match(auth.uid(), esn_id)
  );

-- 3. Replace sales_targets SELECT policy
DROP POLICY IF EXISTS "Users can view relevant sales targets" ON public.sales_targets;
CREATE POLICY "Users can view relevant sales targets"
  ON public.sales_targets FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'gsn'::app_role)
    OR is_member_match(auth.uid(), esn_id)
  );
