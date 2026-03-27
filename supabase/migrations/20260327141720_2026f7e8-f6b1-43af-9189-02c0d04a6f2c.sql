
-- Performance indexes for clients table
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON public.clients USING btree (name);
CREATE INDEX IF NOT EXISTS idx_clients_code ON public.clients USING btree (code);
CREATE INDEX IF NOT EXISTS idx_clients_cnpj ON public.clients USING btree (cnpj);
CREATE INDEX IF NOT EXISTS idx_clients_esn_id ON public.clients USING btree (esn_id);
CREATE INDEX IF NOT EXISTS idx_clients_gsn_id ON public.clients USING btree (gsn_id);
CREATE INDEX IF NOT EXISTS idx_clients_unit_id ON public.clients USING btree (unit_id);

-- Performance indexes for proposals table
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON public.proposals USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.proposals USING btree (status);
CREATE INDEX IF NOT EXISTS idx_proposals_client_id ON public.proposals USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_esn_id ON public.proposals USING btree (esn_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by ON public.proposals USING btree (created_by);

-- Performance indexes for projects table
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects USING btree (status);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_projects_proposal_id ON public.projects USING btree (proposal_id);
CREATE INDEX IF NOT EXISTS idx_projects_arquiteto_id ON public.projects USING btree (arquiteto_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects USING btree (created_by);

-- Performance indexes for scope items (heavy join tables)
CREATE INDEX IF NOT EXISTS idx_proposal_scope_items_proposal_id ON public.proposal_scope_items USING btree (proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_scope_items_parent_id ON public.proposal_scope_items USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_project_scope_items_project_id ON public.project_scope_items USING btree (project_id);

-- Performance indexes for payment_conditions
CREATE INDEX IF NOT EXISTS idx_payment_conditions_proposal_id ON public.payment_conditions USING btree (proposal_id);

-- Performance indexes for proposal_documents
CREATE INDEX IF NOT EXISTS idx_proposal_documents_proposal_id ON public.proposal_documents USING btree (proposal_id);

-- Performance indexes for proposal_signatures
CREATE INDEX IF NOT EXISTS idx_proposal_signatures_proposal_id ON public.proposal_signatures USING btree (proposal_id);

-- Performance indexes for client_contacts
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON public.client_contacts USING btree (client_id);

-- Performance indexes for commission_projections
CREATE INDEX IF NOT EXISTS idx_commission_projections_proposal_id ON public.commission_projections USING btree (proposal_id);
CREATE INDEX IF NOT EXISTS idx_commission_projections_esn_id ON public.commission_projections USING btree (esn_id);
