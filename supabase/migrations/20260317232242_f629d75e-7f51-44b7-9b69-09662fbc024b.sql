
CREATE TABLE public.import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  cleared_before BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_details JSONB DEFAULT '[]'::jsonb,
  summary TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read import logs"
  ON public.import_logs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert import logs"
  ON public.import_logs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update import logs"
  ON public.import_logs FOR UPDATE TO authenticated
  USING (true);
