
CREATE TABLE public.xai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.xai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage xai config" ON public.xai_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view xai config" ON public.xai_config FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.xai_config (ai_model) VALUES ('google/gemini-2.5-flash');
