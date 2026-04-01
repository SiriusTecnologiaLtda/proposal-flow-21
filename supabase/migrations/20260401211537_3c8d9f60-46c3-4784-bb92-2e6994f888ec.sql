
-- Create software_segments table
CREATE TABLE public.software_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint on name
ALTER TABLE public.software_segments ADD CONSTRAINT software_segments_name_unique UNIQUE (name);

-- Enable RLS
ALTER TABLE public.software_segments ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated can view
CREATE POLICY "Authenticated can view software_segments"
  ON public.software_segments FOR SELECT TO authenticated
  USING (true);

-- RLS: admins full access
CREATE POLICY "Admins full access on software_segments"
  ON public.software_segments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add columns to software_proposals for sales team and segment linkage
ALTER TABLE public.software_proposals
  ADD COLUMN gsn_id UUID REFERENCES public.sales_team(id),
  ADD COLUMN esn_id UUID REFERENCES public.sales_team(id),
  ADD COLUMN arquiteto_id UUID REFERENCES public.sales_team(id),
  ADD COLUMN segment_id UUID REFERENCES public.software_segments(id),
  ADD COLUMN raw_gsn_name TEXT,
  ADD COLUMN raw_esn_name TEXT,
  ADD COLUMN raw_arquiteto_name TEXT,
  ADD COLUMN raw_segment_name TEXT;
