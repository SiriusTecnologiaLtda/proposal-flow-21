
-- Add is_default flag to google_integrations
ALTER TABLE public.google_integrations ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Add doc_type to proposal_documents to distinguish proposal vs MIT docs
ALTER TABLE public.proposal_documents ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'proposta';
