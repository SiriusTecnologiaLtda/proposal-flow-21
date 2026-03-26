
-- Signature events history table
CREATE TABLE public.signature_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id uuid NOT NULL REFERENCES public.proposal_signatures(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signature_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view signature events"
  ON public.signature_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert signature events"
  ON public.signature_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service can manage signature events"
  ON public.signature_events FOR ALL TO service_role
  USING (true);
