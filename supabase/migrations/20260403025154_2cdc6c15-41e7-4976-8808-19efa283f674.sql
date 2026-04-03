
-- Add auto-sync configuration columns to email_inbox_config
ALTER TABLE public.email_inbox_config
  ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_interval_minutes integer NOT NULL DEFAULT 10;

-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
