ALTER TABLE public.unit_contacts ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'tae';

COMMENT ON COLUMN public.unit_contacts.contact_type IS 'Type of contact: tae (for signature process) or operacoes (for won proposal communications)';