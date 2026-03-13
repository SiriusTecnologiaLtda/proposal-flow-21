
-- Add tax_factor to unit_info
ALTER TABLE public.unit_info ADD COLUMN IF NOT EXISTS tax_factor NUMERIC NOT NULL DEFAULT 0;

-- Add unit_id to clients (1-1 relationship client→unit)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.unit_info(id);

-- Add esn_id and gsn_id to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS esn_id UUID REFERENCES public.sales_team(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS gsn_id UUID REFERENCES public.sales_team(id);

-- Add unit_id to sales_team
ALTER TABLE public.sales_team ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.unit_info(id);

-- Allow authenticated users to insert unit_info (not just admins for now)
CREATE POLICY "Authenticated users can insert unit info" ON public.unit_info
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to delete unit info (admin only)
CREATE POLICY "Admins can delete unit info" ON public.unit_info
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
