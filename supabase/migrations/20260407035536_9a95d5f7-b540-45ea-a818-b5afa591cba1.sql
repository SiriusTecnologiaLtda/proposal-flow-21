
CREATE TABLE public.sales_team_crm_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_team_id UUID NOT NULL REFERENCES public.sales_team(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_team_crm_codes_sales_team_id ON public.sales_team_crm_codes(sales_team_id);

ALTER TABLE public.sales_team_crm_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view CRM codes"
  ON public.sales_team_crm_codes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert CRM codes"
  ON public.sales_team_crm_codes FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update CRM codes"
  ON public.sales_team_crm_codes FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete CRM codes"
  ON public.sales_team_crm_codes FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_sales_team_crm_codes_updated_at
  BEFORE UPDATE ON public.sales_team_crm_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
