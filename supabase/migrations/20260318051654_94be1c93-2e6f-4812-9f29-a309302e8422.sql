
ALTER TABLE public.proposal_types
  ADD COLUMN analyst_label text NOT NULL DEFAULT 'Analista de Implantação',
  ADD COLUMN gp_label text NOT NULL DEFAULT 'Coordenador de Projeto',
  ADD COLUMN rounding_factor integer NOT NULL DEFAULT 8;
