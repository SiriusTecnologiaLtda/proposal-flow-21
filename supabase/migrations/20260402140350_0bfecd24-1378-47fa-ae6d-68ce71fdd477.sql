
-- Email inbox configuration for software proposal import
CREATE TABLE public.email_inbox_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address text NOT NULL DEFAULT '',
  imap_host text NOT NULL DEFAULT 'mail.noip.com',
  imap_port integer NOT NULL DEFAULT 993,
  use_tls boolean NOT NULL DEFAULT true,
  monitored_folder text NOT NULL DEFAULT 'INBOX',
  sender_filter text DEFAULT '',
  subject_filter text DEFAULT '',
  polling_interval_minutes integer NOT NULL DEFAULT 15,
  enabled boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_sync_status text DEFAULT '',
  last_sync_message text DEFAULT '',
  last_sync_emails_found integer DEFAULT 0,
  last_sync_pdfs_imported integer DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.email_inbox_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on email_inbox_config"
  ON public.email_inbox_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default row
INSERT INTO public.email_inbox_config (id) VALUES (gen_random_uuid());
