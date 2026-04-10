-- 1. Client enrichment fields
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS website text DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS institutional_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS strategic_notes text DEFAULT '';

-- 2. Presentation type configs (one per proposal_type)
CREATE TABLE public.presentation_type_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_type_id uuid NOT NULL REFERENCES public.proposal_types(id) ON DELETE CASCADE,
  executive_summary text NOT NULL DEFAULT '',
  positioning_text text NOT NULL DEFAULT '',
  problem_statement text NOT NULL DEFAULT '',
  solution_approach text NOT NULL DEFAULT '',
  default_benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_scope_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  pricing_display_mode text NOT NULL DEFAULT 'setup_unico',
  differentiators jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_cta text NOT NULL DEFAULT '',
  preferred_template text NOT NULL DEFAULT 'modern',
  "references" jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_type_id)
);

ALTER TABLE public.presentation_type_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage presentation type configs"
  ON public.presentation_type_configs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view presentation type configs"
  ON public.presentation_type_configs FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_presentation_type_configs_updated_at
  BEFORE UPDATE ON public.presentation_type_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Executive presentations (generated entities)
CREATE TABLE public.executive_presentations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  proposal_type_id uuid NOT NULL REFERENCES public.proposal_types(id),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  composed_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  share_slug text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_executive_presentations_share_slug
  ON public.executive_presentations(share_slug)
  WHERE share_slug != '';

ALTER TABLE public.executive_presentations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users who can view proposal can view presentations"
  ON public.executive_presentations FOR SELECT
  TO authenticated
  USING (can_view_proposal_v2(auth.uid(), proposal_id));

CREATE POLICY "Users who can view proposal can insert presentations"
  ON public.executive_presentations FOR INSERT
  TO authenticated
  WITH CHECK (can_view_proposal_v2(auth.uid(), proposal_id));

CREATE POLICY "Users who can view proposal can update presentations"
  ON public.executive_presentations FOR UPDATE
  TO authenticated
  USING (can_view_proposal_v2(auth.uid(), proposal_id));

CREATE POLICY "Users who can view proposal can delete presentations"
  ON public.executive_presentations FOR DELETE
  TO authenticated
  USING (can_view_proposal_v2(auth.uid(), proposal_id));

CREATE TRIGGER update_executive_presentations_updated_at
  BEFORE UPDATE ON public.executive_presentations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();