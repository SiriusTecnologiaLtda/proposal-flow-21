
-- Add output folder to google_integrations (separate from template folder)
ALTER TABLE public.google_integrations ADD COLUMN IF NOT EXISTS output_folder_id text DEFAULT '';

-- Table to track generated proposal documents
CREATE TABLE public.proposal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  doc_id text NOT NULL,
  doc_url text NOT NULL,
  file_name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_official boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.proposal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view proposal documents"
  ON public.proposal_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert proposal documents"
  ON public.proposal_documents FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update proposal documents"
  ON public.proposal_documents FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete proposal documents"
  ON public.proposal_documents FOR DELETE TO authenticated
  USING (true);
