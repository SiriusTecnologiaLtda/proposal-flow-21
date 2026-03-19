
-- Feature requests table
CREATE TABLE public.feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL,
  admin_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Votes table
CREATE TABLE public.feature_request_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feature_request_id, user_id)
);

-- RLS on feature_requests
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view feature requests"
  ON public.feature_requests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert feature requests"
  ON public.feature_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update feature requests"
  ON public.feature_requests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete feature requests"
  ON public.feature_requests FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS on feature_request_votes
ALTER TABLE public.feature_request_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view votes"
  ON public.feature_request_votes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert own votes"
  ON public.feature_request_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON public.feature_request_votes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE TRIGGER update_feature_requests_updated_at
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
