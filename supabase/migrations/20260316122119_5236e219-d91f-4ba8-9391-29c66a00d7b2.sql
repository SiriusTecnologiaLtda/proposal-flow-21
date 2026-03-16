
CREATE TABLE public.proposal_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hourly_rate numeric NOT NULL DEFAULT 250,
  gp_percentage numeric NOT NULL DEFAULT 20,
  travel_local_hours numeric NOT NULL DEFAULT 1,
  travel_trip_hours numeric NOT NULL DEFAULT 4,
  travel_hourly_rate numeric NOT NULL DEFAULT 250,
  additional_analyst_rate numeric NOT NULL DEFAULT 280,
  additional_gp_rate numeric NOT NULL DEFAULT 300,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view defaults"
ON public.proposal_defaults FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage defaults"
ON public.proposal_defaults FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert one default row
INSERT INTO public.proposal_defaults (hourly_rate, gp_percentage, travel_local_hours, travel_trip_hours, travel_hourly_rate, additional_analyst_rate, additional_gp_rate)
VALUES (250, 20, 1, 4, 250, 280, 300);
