
-- Add new proposal status
ALTER TYPE public.proposal_status ADD VALUE IF NOT EXISTS 'em_analise_ev' AFTER 'proposta_gerada';

-- Add proposal_id and proposal_number to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS proposal_number text;
