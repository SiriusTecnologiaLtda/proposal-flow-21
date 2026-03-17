
-- Create api_integrations table
CREATE TABLE public.api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL DEFAULT 'clients',
  label text NOT NULL,
  endpoint_url text NOT NULL,
  http_method text NOT NULL DEFAULT 'GET',
  auth_type text NOT NULL DEFAULT 'none',
  auth_value text,
  headers jsonb DEFAULT '{}'::jsonb,
  body_template text,
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamp with time zone,
  last_sync_status text,
  last_sync_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view integrations"
ON public.api_integrations FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage integrations"
ON public.api_integrations FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_api_integrations_updated_at
BEFORE UPDATE ON public.api_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
