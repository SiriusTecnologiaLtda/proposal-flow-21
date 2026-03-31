ALTER TABLE public.proposal_types DROP COLUMN IF EXISTS allow_project;
ALTER TABLE public.proposal_types DROP COLUMN IF EXISTS require_project;
ALTER TABLE public.proposal_types DROP COLUMN IF EXISTS allow_standalone_scope;