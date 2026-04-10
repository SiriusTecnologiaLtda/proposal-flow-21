-- P3.3: Add explicit payload_hash column for idempotency
ALTER TABLE public.signature_events
ADD COLUMN IF NOT EXISTS payload_hash text;

-- P3.4: Performance indexes for TAE integration
CREATE INDEX IF NOT EXISTS idx_signature_events_payload_hash
ON public.signature_events (payload_hash)
WHERE payload_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_signatures_tae_publication_id
ON public.proposal_signatures (tae_publication_id)
WHERE tae_publication_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_signatures_tae_document_id
ON public.proposal_signatures (tae_document_id)
WHERE tae_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposal_signatories_signature_email
ON public.proposal_signatories (signature_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_signature_events_timeline
ON public.signature_events (signature_id, created_at DESC);