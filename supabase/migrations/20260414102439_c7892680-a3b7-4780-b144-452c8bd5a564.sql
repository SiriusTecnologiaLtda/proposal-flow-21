-- Remove existing schedule if any
SELECT cron.unschedule('extraction-worker-poll')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'extraction-worker-poll');

-- Schedule worker with X-Worker-Secret header (no anon/cron bypass)
SELECT cron.schedule(
  'extraction-worker-poll',
  '* * * * *',
  $$
  SELECT extensions.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/extraction-worker',
    body := '{"source":"cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Secret', current_setting('app.settings.extraction_worker_secret')
    )
  );
  $$
);