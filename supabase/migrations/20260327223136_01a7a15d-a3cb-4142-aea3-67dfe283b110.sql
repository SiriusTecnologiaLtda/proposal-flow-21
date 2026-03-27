
CREATE TABLE public.unit_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.unit_info(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, action_type)
);

ALTER TABLE public.unit_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view unit email templates"
  ON public.unit_email_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert unit email templates"
  ON public.unit_email_templates FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update unit email templates"
  ON public.unit_email_templates FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Admins can delete unit email templates"
  ON public.unit_email_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
