
-- Drop existing SELECT policy on proposals
DROP POLICY IF EXISTS "Users can view own or linked proposals" ON public.proposals;

-- Create new SELECT policy using v2 hierarchical function
CREATE POLICY "Users can view own or linked proposals"
ON public.proposals
FOR SELECT
TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), id));

-- ROLLBACK (keep as comment for reference):
-- DROP POLICY IF EXISTS "Users can view own or linked proposals" ON public.proposals;
-- CREATE POLICY "Users can view own or linked proposals"
-- ON public.proposals FOR SELECT TO authenticated
-- USING (public.can_view_proposal(auth.uid(), id));
