
-- TAE (TOTVS Assinatura Eletrônica) configuration table
CREATE TABLE public.tae_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'staging',
  base_url text NOT NULL DEFAULT 'https://totvssign.staging.totvs.app',
  application_id text DEFAULT '',
  company_cnpj text DEFAULT '',
  notes text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tae_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tae config"
  ON public.tae_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view tae config"
  ON public.tae_config FOR SELECT TO authenticated
  USING (true);

-- Proposal signature tracking table
CREATE TABLE public.proposal_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  tae_publication_id text,
  tae_document_id text,
  status text NOT NULL DEFAULT 'pending',
  sent_by uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view proposal signatures"
  ON public.proposal_signatures FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert proposal signatures"
  ON public.proposal_signatures FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update proposal signatures"
  ON public.proposal_signatures FOR UPDATE TO authenticated USING (true);

-- Proposal signature signatories
CREATE TABLE public.proposal_signatories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id uuid NOT NULL REFERENCES public.proposal_signatures(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.client_contacts(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text DEFAULT 'Signatário',
  status text NOT NULL DEFAULT 'pending',
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_signatories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view signatories"
  ON public.proposal_signatories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert signatories"
  ON public.proposal_signatories FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update signatories"
  ON public.proposal_signatories FOR UPDATE TO authenticated USING (true);
