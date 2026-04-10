
-- =============================================
-- Remove redundant v1 UPDATE policy on proposals
-- The v2 policy "Users can update own proposals" already covers all cases
-- =============================================

DROP POLICY IF EXISTS "Users can update proposals" ON public.proposals;
