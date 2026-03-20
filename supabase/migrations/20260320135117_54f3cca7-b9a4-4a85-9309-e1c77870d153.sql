
-- Add 'consulta' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consulta';

-- Table to define which units a consulta user can access
CREATE TABLE public.user_unit_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.unit_info(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, unit_id)
);

ALTER TABLE public.user_unit_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user unit access" ON public.user_unit_access FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own unit access" ON public.user_unit_access FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Add is_cra flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_cra boolean NOT NULL DEFAULT false;
