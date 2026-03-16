ALTER TABLE public.proposal_defaults ADD COLUMN accomp_analyst_percentage numeric NOT NULL DEFAULT 15;
ALTER TABLE public.proposal_defaults ADD COLUMN accomp_gp_percentage numeric NOT NULL DEFAULT 10;