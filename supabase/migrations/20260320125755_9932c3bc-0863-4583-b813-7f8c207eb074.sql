
ALTER TABLE public.sales_team ADD COLUMN commission_pct numeric NOT NULL DEFAULT 3;

CREATE TABLE public.commission_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  esn_id uuid NOT NULL REFERENCES public.sales_team(id) ON DELETE CASCADE,
  installment integer NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  commission_pct numeric NOT NULL DEFAULT 0,
  commission_value numeric NOT NULL DEFAULT 0,
  proposal_status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view commission projections"
  ON public.commission_projections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert commission projections"
  ON public.commission_projections FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update commission projections"
  ON public.commission_projections FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete commission projections"
  ON public.commission_projections FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_commission_projections_esn ON public.commission_projections(esn_id);
CREATE INDEX idx_commission_projections_due_date ON public.commission_projections(due_date);
CREATE INDEX idx_commission_projections_proposal ON public.commission_projections(proposal_id);
