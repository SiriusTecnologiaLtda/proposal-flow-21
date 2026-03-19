CREATE TABLE public.proposal_process_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  stage text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  action text NOT NULL DEFAULT 'proposal_create',
  proposal_id uuid NULL REFERENCES public.proposals(id) ON DELETE SET NULL,
  client_id uuid NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  user_email text NULL,
  user_name text NULL,
  proposal_number text NULL,
  error_message text NULL,
  error_code text NULL,
  error_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.proposal_process_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all proposal process logs"
ON public.proposal_process_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own proposal process logs"
ON public.proposal_process_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proposal process logs"
ON public.proposal_process_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_proposal_process_logs_created_at
ON public.proposal_process_logs (created_at DESC);

CREATE INDEX idx_proposal_process_logs_user_id
ON public.proposal_process_logs (user_id);

CREATE INDEX idx_proposal_process_logs_stage
ON public.proposal_process_logs (stage);

CREATE INDEX idx_proposal_process_logs_severity
ON public.proposal_process_logs (severity);

CREATE INDEX idx_proposal_process_logs_proposal_id
ON public.proposal_process_logs (proposal_id);