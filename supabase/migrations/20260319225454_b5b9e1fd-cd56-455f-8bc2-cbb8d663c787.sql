
-- Sales targets table: monthly targets per ESN
CREATE TABLE public.sales_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  esn_id uuid NOT NULL REFERENCES public.sales_team(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (esn_id, year, month)
);

-- RLS
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sales targets"
  ON public.sales_targets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage sales targets"
  ON public.sales_targets FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Updated at trigger
CREATE TRIGGER update_sales_targets_updated_at
  BEFORE UPDATE ON public.sales_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
