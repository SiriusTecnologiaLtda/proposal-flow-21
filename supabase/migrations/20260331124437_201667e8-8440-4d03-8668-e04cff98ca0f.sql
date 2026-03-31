
-- 1. google_integrations: restrict SELECT to admin only
DROP POLICY IF EXISTS "Authenticated users can view google integrations" ON public.google_integrations;
CREATE POLICY "Admins can view google integrations"
  ON public.google_integrations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. api_integrations: restrict SELECT to admin only
DROP POLICY IF EXISTS "Authenticated users can view integrations" ON public.api_integrations;
CREATE POLICY "Admins can view integrations"
  ON public.api_integrations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. tae_config: restrict SELECT to admin only
DROP POLICY IF EXISTS "Authenticated users can view tae config" ON public.tae_config;
CREATE POLICY "Admins can view tae config"
  ON public.tae_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. whatsapp_config: restrict SELECT to admin only
DROP POLICY IF EXISTS "Authenticated users can view whatsapp config" ON public.whatsapp_config;
CREATE POLICY "Admins can view whatsapp config"
  ON public.whatsapp_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. whatsapp_messages: restrict SELECT to owner or admin
DROP POLICY IF EXISTS "Authenticated users can view whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Users can view own whatsapp messages"
  ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 6. sync_log_events: restrict SELECT to admin only
DROP POLICY IF EXISTS "Authenticated users can view sync log events" ON public.sync_log_events;
CREATE POLICY "Admins can view sync log events"
  ON public.sync_log_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 7. commission_projections: restrict write ops to admin
DROP POLICY IF EXISTS "Authenticated users can delete commission projections" ON public.commission_projections;
DROP POLICY IF EXISTS "Authenticated users can insert commission projections" ON public.commission_projections;
DROP POLICY IF EXISTS "Authenticated users can update commission projections" ON public.commission_projections;
CREATE POLICY "Admins can insert commission projections"
  ON public.commission_projections FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update commission projections"
  ON public.commission_projections FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete commission projections"
  ON public.commission_projections FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 8. proposal_signatories: restrict write to proposal owner or admin
DROP POLICY IF EXISTS "Authenticated users can insert signatories" ON public.proposal_signatories;
DROP POLICY IF EXISTS "Authenticated users can update signatories" ON public.proposal_signatories;
CREATE POLICY "Authorized users can insert signatories"
  ON public.proposal_signatories FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.proposal_signatures ps
      JOIN public.proposals p ON p.id = ps.proposal_id
      WHERE ps.id = signature_id AND p.created_by = auth.uid()
    )
  );
CREATE POLICY "Authorized users can update signatories"
  ON public.proposal_signatories FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.proposal_signatures ps
      JOIN public.proposals p ON p.id = ps.proposal_id
      WHERE ps.id = signature_id AND p.created_by = auth.uid()
    )
  );

-- 9. client_contacts: restrict write to admin
DROP POLICY IF EXISTS "Authenticated users can insert client contacts" ON public.client_contacts;
DROP POLICY IF EXISTS "Authenticated users can update client contacts" ON public.client_contacts;
CREATE POLICY "Admins can insert client contacts"
  ON public.client_contacts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update client contacts"
  ON public.client_contacts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
