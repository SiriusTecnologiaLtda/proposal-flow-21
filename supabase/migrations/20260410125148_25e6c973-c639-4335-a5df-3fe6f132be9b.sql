-- =============================================
-- ETAPA 1: proposals UPDATE → can_view_proposal_v2
-- =============================================

-- Drop legacy UPDATE policy
DROP POLICY IF EXISTS "Users can update own proposals" ON public.proposals;

-- New UPDATE policy using hierarchical v2 function
CREATE POLICY "Users can update own proposals"
ON public.proposals
FOR UPDATE
TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), id));

-- =============================================
-- ROLLBACK Etapa 1:
-- =============================================
-- DROP POLICY IF EXISTS "Users can update own proposals" ON public.proposals;
-- CREATE POLICY "Users can update own proposals"
-- ON public.proposals FOR UPDATE TO authenticated
-- USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));
