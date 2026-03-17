
-- Add schedule fields to api_integrations
ALTER TABLE public.api_integrations
  ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_cron text,
  ADD COLUMN IF NOT EXISTS schedule_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule_time text;

-- Unique constraint on entity (one integration per entity)
ALTER TABLE public.api_integrations
  ADD CONSTRAINT api_integrations_entity_unique UNIQUE (entity);

-- Create sync_logs table
CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.api_integrations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  total_records integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  error_message text,
  trigger_type text NOT NULL DEFAULT 'manual'
);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated can SELECT
CREATE POLICY "Authenticated users can view sync logs"
  ON public.sync_logs FOR SELECT TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for regular users — edge function uses service role
