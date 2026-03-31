
-- Fix remaining RLS policies with USING(true) or WITH CHECK(true) on write operations
-- Strategy: restrict writes to proposal/project owner or admin using can_view_proposal/can_view_project

-- payment_conditions: restrict to proposal owner or admin
DROP POLICY IF EXISTS "Users can delete payments" ON public.payment_conditions;
DROP POLICY IF EXISTS "Users can insert payments" ON public.payment_conditions;
DROP POLICY IF EXISTS "Users can update payments" ON public.payment_conditions;
CREATE POLICY "Authorized users can insert payments" ON public.payment_conditions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND (p.created_by = auth.uid() OR public.can_view_proposal(p.id, auth.uid()))));
CREATE POLICY "Authorized users can update payments" ON public.payment_conditions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND (p.created_by = auth.uid() OR public.can_view_proposal(p.id, auth.uid()))));
CREATE POLICY "Authorized users can delete payments" ON public.payment_conditions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND (p.created_by = auth.uid() OR public.can_view_proposal(p.id, auth.uid()))));

-- proposal_scope_items: restrict to proposal owner or admin
DROP POLICY IF EXISTS "Users can delete proposal scope" ON public.proposal_scope_items;
DROP POLICY IF EXISTS "Users can insert proposal scope" ON public.proposal_scope_items;
DROP POLICY IF EXISTS "Users can update proposal scope" ON public.proposal_scope_items;
CREATE POLICY "Authorized users can insert proposal scope" ON public.proposal_scope_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can update proposal scope" ON public.proposal_scope_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can delete proposal scope" ON public.proposal_scope_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));

-- proposal_macro_scope: restrict to proposal owner or admin
DROP POLICY IF EXISTS "Users can delete macro scope" ON public.proposal_macro_scope;
DROP POLICY IF EXISTS "Users can insert macro scope" ON public.proposal_macro_scope;
DROP POLICY IF EXISTS "Users can update macro scope" ON public.proposal_macro_scope;
CREATE POLICY "Authorized users can insert macro scope" ON public.proposal_macro_scope FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can update macro scope" ON public.proposal_macro_scope FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can delete macro scope" ON public.proposal_macro_scope FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));

-- project_scope_items: restrict to project owner or admin
DROP POLICY IF EXISTS "Users can delete project scope" ON public.project_scope_items;
DROP POLICY IF EXISTS "Users can insert project scope" ON public.project_scope_items;
DROP POLICY IF EXISTS "Users can update project scope" ON public.project_scope_items;
CREATE POLICY "Authorized users can insert project scope" ON public.project_scope_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can update project scope" ON public.project_scope_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can delete project scope" ON public.project_scope_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid()));

-- project_attachments: restrict to project owner or admin
DROP POLICY IF EXISTS "Users can delete project attachments" ON public.project_attachments;
DROP POLICY IF EXISTS "Users can insert project attachments" ON public.project_attachments;
DROP POLICY IF EXISTS "Users can update project attachments" ON public.project_attachments;
CREATE POLICY "Authorized users can insert project attachments" ON public.project_attachments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can update project attachments" ON public.project_attachments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can delete project attachments" ON public.project_attachments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid()));

-- proposal_documents: restrict to proposal owner or admin
DROP POLICY IF EXISTS "Authenticated users can delete proposal documents" ON public.proposal_documents;
DROP POLICY IF EXISTS "Authenticated users can insert proposal documents" ON public.proposal_documents;
DROP POLICY IF EXISTS "Authenticated users can update proposal documents" ON public.proposal_documents;
CREATE POLICY "Authorized users can insert proposal documents" ON public.proposal_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can update proposal documents" ON public.proposal_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can delete proposal documents" ON public.proposal_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));

-- proposal_signatures: restrict to proposal owner or admin
DROP POLICY IF EXISTS "Authenticated users can insert proposal signatures" ON public.proposal_signatures;
DROP POLICY IF EXISTS "Authenticated users can update proposal signatures" ON public.proposal_signatures;
CREATE POLICY "Authorized users can insert proposal signatures" ON public.proposal_signatures FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));
CREATE POLICY "Authorized users can update proposal signatures" ON public.proposal_signatures FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND p.created_by = auth.uid()));

-- import_logs: restrict to admin
DROP POLICY IF EXISTS "Authenticated users can insert import logs" ON public.import_logs;
DROP POLICY IF EXISTS "Authenticated users can update import logs" ON public.import_logs;
CREATE POLICY "Admins can insert import logs" ON public.import_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update import logs" ON public.import_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- unit_contacts, unit_email_templates, unit_info: restrict to admin
DROP POLICY IF EXISTS "Authenticated users can insert unit contacts" ON public.unit_contacts;
DROP POLICY IF EXISTS "Authenticated users can update unit contacts" ON public.unit_contacts;
CREATE POLICY "Admins can insert unit contacts" ON public.unit_contacts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update unit contacts" ON public.unit_contacts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can insert unit email templates" ON public.unit_email_templates;
DROP POLICY IF EXISTS "Authenticated users can update unit email templates" ON public.unit_email_templates;
CREATE POLICY "Admins can insert unit email templates" ON public.unit_email_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update unit email templates" ON public.unit_email_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can insert unit info" ON public.unit_info;
CREATE POLICY "Admins can insert unit info" ON public.unit_info FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- signature_events: restrict to admin (webhooks use service role)
DROP POLICY IF EXISTS "Service can manage signature events" ON public.signature_events;
DROP POLICY IF EXISTS "Authenticated users can insert signature events" ON public.signature_events;
CREATE POLICY "Admins can manage signature events" ON public.signature_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- client_edit_logs: restrict insert to authenticated with proper check
DROP POLICY IF EXISTS "Authenticated users can insert client edit logs" ON public.client_edit_logs;
CREATE POLICY "Users can insert own client edit logs" ON public.client_edit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- clients: restrict insert to admin
DROP POLICY IF EXISTS "Users can insert clients" ON public.clients;
CREATE POLICY "Admins can insert clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- whatsapp_messages: restrict insert to admin (webhook uses service role)
DROP POLICY IF EXISTS "Service can insert whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Admins can insert whatsapp messages" ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
