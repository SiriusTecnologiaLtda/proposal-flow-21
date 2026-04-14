
CREATE OR REPLACE FUNCTION public.claim_extraction_jobs(max_jobs int DEFAULT 10)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT ej.id
    FROM public.extraction_jobs ej
    WHERE ej.status = 'queued'
      AND ej.available_at <= now()
      AND ej.deadline_at > now()
    ORDER BY ej.priority, ej.available_at
    LIMIT max_jobs
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.extraction_jobs ej
  SET status = 'running',
      started_at = COALESCE(ej.started_at, now()),
      heartbeat_at = now(),
      first_attempt_at = COALESCE(ej.first_attempt_at, now()),
      attempt = ej.attempt + 1
  FROM claimed
  WHERE ej.id = claimed.id
  RETURNING ej.id;
END;
$$;
