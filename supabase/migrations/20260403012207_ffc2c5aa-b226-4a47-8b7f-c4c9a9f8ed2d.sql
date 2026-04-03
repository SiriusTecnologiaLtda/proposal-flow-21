
CREATE TABLE public.email_import_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text NOT NULL,
  subject text,
  sender text,
  received_at timestamp with time zone,
  message_id_header text,
  status text NOT NULL DEFAULT 'pending',
  error_type text,
  error_message text,
  requires_action text,
  retry_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by uuid,
  software_proposal_id uuid,
  attachment_filename text,
  attachment_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.email_import_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on email_import_attempts"
  ON public.email_import_attempts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own email_import_attempts"
  ON public.email_import_attempts FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_email_import_attempts_status ON public.email_import_attempts(status);
CREATE INDEX idx_email_import_attempts_gmail_id ON public.email_import_attempts(gmail_message_id);
