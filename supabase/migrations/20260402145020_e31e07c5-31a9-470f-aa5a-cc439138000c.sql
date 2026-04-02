
ALTER TABLE public.email_inbox_config
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail',
  ADD COLUMN IF NOT EXISTS gmail_client_id text,
  ADD COLUMN IF NOT EXISTS gmail_client_secret text,
  ADD COLUMN IF NOT EXISTS gmail_refresh_token text;

UPDATE public.email_inbox_config SET provider = 'gmail' WHERE provider IS NULL;
