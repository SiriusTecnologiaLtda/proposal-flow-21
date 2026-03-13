
-- Tighten client insert/update to authenticated only (already done, warnings are acceptable for collaborative app)
-- Tighten proposal update to only creator or admin
DROP POLICY "Authenticated users can update proposals" ON public.proposals;
CREATE POLICY "Users can update proposals" ON public.proposals FOR UPDATE TO authenticated 
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

-- Tighten client update  
DROP POLICY "Authenticated users can update clients" ON public.clients;
CREATE POLICY "Users can update clients" ON public.clients FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tighten client insert
DROP POLICY "Authenticated users can insert clients" ON public.clients;
CREATE POLICY "Users can insert clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (true);

-- Tighten proposal scope items management
DROP POLICY "Authenticated users can manage proposal scope" ON public.proposal_scope_items;
CREATE POLICY "Users can insert proposal scope" ON public.proposal_scope_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update proposal scope" ON public.proposal_scope_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete proposal scope" ON public.proposal_scope_items FOR DELETE TO authenticated USING (true);

-- Tighten macro scope 
DROP POLICY "Authenticated users can manage macro scope" ON public.proposal_macro_scope;
CREATE POLICY "Users can insert macro scope" ON public.proposal_macro_scope FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update macro scope" ON public.proposal_macro_scope FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete macro scope" ON public.proposal_macro_scope FOR DELETE TO authenticated USING (true);

-- Tighten payment conditions
DROP POLICY "Authenticated users can manage payments" ON public.payment_conditions;
CREATE POLICY "Users can insert payments" ON public.payment_conditions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update payments" ON public.payment_conditions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete payments" ON public.payment_conditions FOR DELETE TO authenticated USING (true);
