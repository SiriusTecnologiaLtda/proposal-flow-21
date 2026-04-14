
-- Table: extraction_jobs (job queue for software proposal extraction)
CREATE TABLE public.extraction_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     uuid NOT NULL REFERENCES public.software_proposals(id) ON DELETE CASCADE,
  batch_id        uuid,
  requested_by    uuid NOT NULL,
  source          text NOT NULL DEFAULT 'manual',
  priority        int NOT NULL DEFAULT 100,

  status          text NOT NULL DEFAULT 'queued',
  attempt         int NOT NULL DEFAULT 0,
  max_attempts    int NOT NULL DEFAULT 3,

  error_code      text,
  error_message   text,
  retryable       boolean DEFAULT false,

  items_extracted int,
  issues_created  int,

  available_at    timestamptz NOT NULL DEFAULT now(),
  deadline_at     timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  first_attempt_at timestamptz,
  heartbeat_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,

  cancel_requested_at timestamptz,
  cancel_reason   text
);

-- Anti-duplicate: max 1 active job per proposal (used for transactional idempotency)
ALTER TABLE public.extraction_jobs
  ADD CONSTRAINT uq_extraction_jobs_active_proposal
  EXCLUDE USING btree (proposal_id WITH =)
  WHERE (status IN ('queued', 'running'));

-- Worker poll index (optimized)
CREATE INDEX idx_extraction_jobs_poll
  ON public.extraction_jobs (priority, available_at)
  WHERE status = 'queued';

-- Batch progress
CREATE INDEX idx_extraction_jobs_batch
  ON public.extraction_jobs (batch_id)
  WHERE batch_id IS NOT NULL;

-- User lookup
CREATE INDEX idx_extraction_jobs_user
  ON public.extraction_jobs (requested_by);

-- Watchdog: stuck running jobs
CREATE INDEX idx_extraction_jobs_stuck
  ON public.extraction_jobs (heartbeat_at)
  WHERE status = 'running';

-- Enable RLS
ALTER TABLE public.extraction_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: user sees own jobs, admin sees all
CREATE POLICY "Users can view own extraction jobs"
  ON public.extraction_jobs FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- INSERT: authenticated user can enqueue for themselves
CREATE POLICY "Users can insert own extraction jobs"
  ON public.extraction_jobs FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- UPDATE/DELETE: no policies for authenticated = blocked (only service_role can update)

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.extraction_jobs;
