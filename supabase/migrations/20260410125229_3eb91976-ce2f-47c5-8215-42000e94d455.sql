-- =============================================
-- ETAPA 2: Proposal child tables write → can_view_proposal_v2
-- =============================================

-- ---- proposal_documents ----
DROP POLICY IF EXISTS "Authorized users can insert proposal documents" ON public.proposal_documents;
CREATE POLICY "Authorized users can insert proposal documents"
ON public.proposal_documents FOR INSERT TO authenticated
WITH CHECK (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can update proposal documents" ON public.proposal_documents;
CREATE POLICY "Authorized users can update proposal documents"
ON public.proposal_documents FOR UPDATE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can delete proposal documents" ON public.proposal_documents;
CREATE POLICY "Authorized users can delete proposal documents"
ON public.proposal_documents FOR DELETE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- ---- proposal_macro_scope ----
DROP POLICY IF EXISTS "Authorized users can insert macro scope" ON public.proposal_macro_scope;
CREATE POLICY "Authorized users can insert macro scope"
ON public.proposal_macro_scope FOR INSERT TO authenticated
WITH CHECK (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can update macro scope" ON public.proposal_macro_scope;
CREATE POLICY "Authorized users can update macro scope"
ON public.proposal_macro_scope FOR UPDATE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can delete macro scope" ON public.proposal_macro_scope;
CREATE POLICY "Authorized users can delete macro scope"
ON public.proposal_macro_scope FOR DELETE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- ---- proposal_service_items ----
DROP POLICY IF EXISTS "Authorized users can insert proposal service items" ON public.proposal_service_items;
CREATE POLICY "Authorized users can insert proposal service items"
ON public.proposal_service_items FOR INSERT TO authenticated
WITH CHECK (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can update proposal service items" ON public.proposal_service_items;
CREATE POLICY "Authorized users can update proposal service items"
ON public.proposal_service_items FOR UPDATE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can delete proposal service items" ON public.proposal_service_items;
CREATE POLICY "Authorized users can delete proposal service items"
ON public.proposal_service_items FOR DELETE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- ---- proposal_scope_items ----
DROP POLICY IF EXISTS "Authorized users can insert proposal scope" ON public.proposal_scope_items;
CREATE POLICY "Authorized users can insert proposal scope"
ON public.proposal_scope_items FOR INSERT TO authenticated
WITH CHECK (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can update proposal scope" ON public.proposal_scope_items;
CREATE POLICY "Authorized users can update proposal scope"
ON public.proposal_scope_items FOR UPDATE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can delete proposal scope" ON public.proposal_scope_items;
CREATE POLICY "Authorized users can delete proposal scope"
ON public.proposal_scope_items FOR DELETE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- ---- payment_conditions ----
DROP POLICY IF EXISTS "Authorized users can insert payments" ON public.payment_conditions;
CREATE POLICY "Authorized users can insert payments"
ON public.payment_conditions FOR INSERT TO authenticated
WITH CHECK (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can update payments" ON public.payment_conditions;
CREATE POLICY "Authorized users can update payments"
ON public.payment_conditions FOR UPDATE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can delete payments" ON public.payment_conditions;
CREATE POLICY "Authorized users can delete payments"
ON public.payment_conditions FOR DELETE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- ---- proposal_signatures ----
DROP POLICY IF EXISTS "Authorized users can insert proposal signatures" ON public.proposal_signatures;
CREATE POLICY "Authorized users can insert proposal signatures"
ON public.proposal_signatures FOR INSERT TO authenticated
WITH CHECK (public.can_view_proposal_v2(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Authorized users can update proposal signatures" ON public.proposal_signatures;
CREATE POLICY "Authorized users can update proposal signatures"
ON public.proposal_signatures FOR UPDATE TO authenticated
USING (public.can_view_proposal_v2(auth.uid(), proposal_id));

-- ---- proposal_signatories (INSERT + UPDATE only, no DELETE) ----
DROP POLICY IF EXISTS "Authorized users can insert signatories" ON public.proposal_signatories;
CREATE POLICY "Authorized users can insert signatories"
ON public.proposal_signatories FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_signatures ps
    WHERE ps.id = proposal_signatories.signature_id
      AND public.can_view_proposal_v2(auth.uid(), ps.proposal_id)
  )
);

DROP POLICY IF EXISTS "Authorized users can update signatories" ON public.proposal_signatories;
CREATE POLICY "Authorized users can update signatories"
ON public.proposal_signatories FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.proposal_signatures ps
    WHERE ps.id = proposal_signatories.signature_id
      AND public.can_view_proposal_v2(auth.uid(), ps.proposal_id)
  )
);

-- =============================================
-- ROLLBACK Etapa 2 (restore created_by-based policies):
-- =============================================
-- See previous policy definitions in RLS audit for each table.
-- Pattern was: admin OR (EXISTS proposals WHERE created_by = auth.uid())
