
-- Add resumable sync fields to sync_logs
ALTER TABLE public.sync_logs 
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS current_offset integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS page_size integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS pages_processed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_page_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_fetched integer DEFAULT 0;

-- Add store_code to clients for Protheus A1_LOJA deduplication
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS store_code text DEFAULT '';

-- Create unique index for code + store_code dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_code_store ON public.clients (code, store_code);

-- Add pagination_order_by to api_integrations
ALTER TABLE public.api_integrations
  ADD COLUMN IF NOT EXISTS pagination_order_by text DEFAULT '';

-- Create sync_log_events table for per-page observability
CREATE TABLE IF NOT EXISTS public.sync_log_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id uuid NOT NULL REFERENCES public.sync_logs(id) ON DELETE CASCADE,
  page_number integer NOT NULL DEFAULT 0,
  page_offset integer NOT NULL DEFAULT 0,
  http_status integer,
  records_in_page integer DEFAULT 0,
  curl_command text,
  response_preview text,
  error_message text,
  duration_ms integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_log_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync log events"
  ON public.sync_log_events FOR SELECT TO authenticated USING (true);
