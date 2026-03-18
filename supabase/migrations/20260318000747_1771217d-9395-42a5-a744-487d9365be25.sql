
-- Create proposal_types table
CREATE TABLE public.proposal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  template_doc_id TEXT,
  mit_template_doc_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view proposal types"
  ON public.proposal_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage proposal types"
  ON public.proposal_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed initial types
INSERT INTO public.proposal_types (name, slug) VALUES
  ('Projeto', 'projeto'),
  ('Banco de Horas', 'banco_de_horas');
