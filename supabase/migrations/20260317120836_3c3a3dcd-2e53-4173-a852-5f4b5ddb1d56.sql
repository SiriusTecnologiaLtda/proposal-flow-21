ALTER TABLE public.google_integrations
  ADD COLUMN auth_type text NOT NULL DEFAULT 'service_account',
  ADD COLUMN oauth_client_id text,
  ADD COLUMN oauth_client_secret text,
  ADD COLUMN oauth_refresh_token text;

ALTER TABLE public.google_integrations
  ALTER COLUMN service_account_key DROP NOT NULL,
  ALTER COLUMN service_account_key SET DEFAULT '';