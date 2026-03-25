ALTER TABLE public.proposal_types
  ADD COLUMN allow_project boolean NOT NULL DEFAULT true,
  ADD COLUMN require_project boolean NOT NULL DEFAULT false,
  ADD COLUMN allow_standalone_scope boolean NOT NULL DEFAULT true;