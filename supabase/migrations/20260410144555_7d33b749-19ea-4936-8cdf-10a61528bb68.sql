
-- =============================================
-- STEP 1: Harden SELECT RLS on proposal child tables
-- Replace USING (true) with can_view_proposal_v2
-- =============================================

-- 1. payment_conditions
DROP POLICY IF EXISTS "Authenticated users can view payments" ON public.payment_conditions;
CREATE POLICY "Authorized users can view payments"
  ON public.payment_conditions FOR SELECT TO authenticated
  USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- 2. proposal_documents
DROP POLICY IF EXISTS "Authenticated users can view proposal documents" ON public.proposal_documents;
CREATE POLICY "Authorized users can view proposal documents"
  ON public.proposal_documents FOR SELECT TO authenticated
  USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- 3. proposal_macro_scope
DROP POLICY IF EXISTS "Authenticated users can view macro scope" ON public.proposal_macro_scope;
CREATE POLICY "Authorized users can view macro scope"
  ON public.proposal_macro_scope FOR SELECT TO authenticated
  USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- 4. proposal_scope_items
DROP POLICY IF EXISTS "Authenticated users can view proposal scope" ON public.proposal_scope_items;
CREATE POLICY "Authorized users can view proposal scope"
  ON public.proposal_scope_items FOR SELECT TO authenticated
  USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- 5. proposal_service_items
DROP POLICY IF EXISTS "Authenticated users can view proposal service items" ON public.proposal_service_items;
CREATE POLICY "Authorized users can view proposal service items"
  ON public.proposal_service_items FOR SELECT TO authenticated
  USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- 6. proposal_signatures
DROP POLICY IF EXISTS "Authenticated users can view proposal signatures" ON public.proposal_signatures;
CREATE POLICY "Authorized users can view proposal signatures"
  ON public.proposal_signatures FOR SELECT TO authenticated
  USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- 7. proposal_signatories (indirect via signature_id → proposal_signatures.proposal_id)
DROP POLICY IF EXISTS "Authenticated users can view signatories" ON public.proposal_signatories;
CREATE POLICY "Authorized users can view signatories"
  ON public.proposal_signatories FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.proposal_signatures ps
    WHERE ps.id = proposal_signatories.signature_id
      AND public.can_view_proposal_v2(auth.uid(), ps.proposal_id)
  ));
