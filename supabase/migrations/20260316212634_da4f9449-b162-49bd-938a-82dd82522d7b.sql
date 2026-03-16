
CREATE TABLE public.google_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  service_account_key text NOT NULL,
  drive_folder_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.google_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view google integrations"
  ON public.google_integrations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage google integrations"
  ON public.google_integrations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_google_integrations_updated_at
  BEFORE UPDATE ON public.google_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
