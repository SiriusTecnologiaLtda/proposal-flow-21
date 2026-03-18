
CREATE TABLE public.client_edit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}',
  context text NOT NULL DEFAULT 'proposal_create',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_edit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view client edit logs"
ON public.client_edit_logs FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert client edit logs"
ON public.client_edit_logs FOR INSERT TO authenticated
WITH CHECK (true);
