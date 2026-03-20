
CREATE TABLE public.unit_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.unit_info(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text DEFAULT 'Signatário',
  department text DEFAULT '',
  position text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unit_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view unit contacts" ON public.unit_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert unit contacts" ON public.unit_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update unit contacts" ON public.unit_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete unit contacts" ON public.unit_contacts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
