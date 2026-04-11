
-- Migration 1: scope_template_knowledge
CREATE TABLE public.scope_template_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL UNIQUE
    REFERENCES public.scope_templates(id) ON DELETE CASCADE,
  commercial_description text NOT NULL DEFAULT '',
  executive_benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  executive_notes text NOT NULL DEFAULT '',
  generation_preprompt text NOT NULL DEFAULT '',
  extraction_status text NOT NULL DEFAULT 'idle',
  extracted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scope_template_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scope_template_knowledge"
  ON public.scope_template_knowledge FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and arquitetos can insert scope_template_knowledge"
  ON public.scope_template_knowledge FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'arquiteto'::app_role)
  );

CREATE POLICY "Admins and arquitetos can update scope_template_knowledge"
  ON public.scope_template_knowledge FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'arquiteto'::app_role)
  );

CREATE POLICY "Admins and arquitetos can delete scope_template_knowledge"
  ON public.scope_template_knowledge FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'arquiteto'::app_role)
  );

CREATE TRIGGER update_scope_template_knowledge_updated_at
  BEFORE UPDATE ON public.scope_template_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migration 2: scope_template_sources
CREATE TABLE public.scope_template_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL
    REFERENCES public.scope_templates(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('url', 'drive_file')),
  label text NOT NULL DEFAULT '',
  url text NULL,
  drive_file_id text NULL,
  drive_file_name text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message text NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scope_template_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scope_template_sources"
  ON public.scope_template_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and arquitetos can insert scope_template_sources"
  ON public.scope_template_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'arquiteto'::app_role)
  );

CREATE POLICY "Admins and arquitetos can update scope_template_sources"
  ON public.scope_template_sources FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'arquiteto'::app_role)
  );

CREATE POLICY "Admins and arquitetos can delete scope_template_sources"
  ON public.scope_template_sources FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'arquiteto'::app_role)
  );

-- Migration 3: knowledge_folder_id on google_integrations
ALTER TABLE public.google_integrations
  ADD COLUMN IF NOT EXISTS knowledge_folder_id text NULL;
