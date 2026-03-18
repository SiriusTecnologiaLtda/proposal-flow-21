
-- Replace proposal_status enum with new values
-- First rename old enum
ALTER TYPE public.proposal_status RENAME TO proposal_status_old;

-- Create new enum
CREATE TYPE public.proposal_status AS ENUM ('pendente', 'proposta_gerada', 'em_assinatura', 'ganha', 'cancelada');

-- Update column default
ALTER TABLE public.proposals ALTER COLUMN status DROP DEFAULT;

-- Convert existing values
ALTER TABLE public.proposals 
  ALTER COLUMN status TYPE public.proposal_status 
  USING CASE status::text
    WHEN 'rascunho' THEN 'pendente'::public.proposal_status
    WHEN 'em_revisao' THEN 'pendente'::public.proposal_status
    WHEN 'aprovada' THEN 'proposta_gerada'::public.proposal_status
    WHEN 'enviada' THEN 'proposta_gerada'::public.proposal_status
    WHEN 'cancelada' THEN 'cancelada'::public.proposal_status
    WHEN 'ganha' THEN 'ganha'::public.proposal_status
    ELSE 'pendente'::public.proposal_status
  END;

-- Set new default
ALTER TABLE public.proposals ALTER COLUMN status SET DEFAULT 'pendente'::public.proposal_status;

-- Drop old enum
DROP TYPE public.proposal_status_old;

-- Create client_contacts table for signatories
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view client contacts"
  ON public.client_contacts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert client contacts"
  ON public.client_contacts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update client contacts"
  ON public.client_contacts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete client contacts"
  ON public.client_contacts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
