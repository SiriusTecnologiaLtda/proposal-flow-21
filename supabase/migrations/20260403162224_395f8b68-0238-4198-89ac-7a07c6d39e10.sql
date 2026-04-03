-- Revenue line enum
CREATE TYPE public.revenue_line AS ENUM (
  'producao',
  'recorrente',
  'nao_recorrente',
  'servico',
  'rrf',
  'nrf'
);

-- Revenue targets table
CREATE TABLE public.revenue_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID REFERENCES public.unit_info(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  revenue_line public.revenue_line NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (unit_id, year, month, revenue_line)
);

-- Enable RLS
ALTER TABLE public.revenue_targets ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view revenue targets"
  ON public.revenue_targets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert revenue targets"
  ON public.revenue_targets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update revenue targets"
  ON public.revenue_targets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete revenue targets"
  ON public.revenue_targets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Timestamp trigger
CREATE TRIGGER update_revenue_targets_updated_at
  BEFORE UPDATE ON public.revenue_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();