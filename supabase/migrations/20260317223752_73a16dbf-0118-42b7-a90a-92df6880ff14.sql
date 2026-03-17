
-- 1. Create security definer function to check proposal visibility
CREATE OR REPLACE FUNCTION public.can_view_proposal(_user_id uuid, _proposal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.proposals
      WHERE id = _proposal_id AND created_by = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.sales_team st ON lower(st.email) = lower(u.email)
      JOIN public.proposals p ON p.id = _proposal_id
      WHERE u.id = _user_id
        AND (st.id = p.esn_id OR st.id = p.gsn_id OR st.id = p.arquiteto_id)
    )
$$;

-- 2. Drop the old permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view proposals" ON public.proposals;

-- 3. Create new SELECT policy using the function
CREATE POLICY "Users can view own or linked proposals"
ON public.proposals
FOR SELECT
TO authenticated
USING (public.can_view_proposal(auth.uid(), id));
