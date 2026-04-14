-- Drop the broken schedule
SELECT cron.unschedule('extraction-worker-poll');

-- Recreate with hardcoded URL and secret (cron.job is only accessible by postgres role)
SELECT cron.schedule(
  'extraction-worker-poll',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vpyniuyqmseusowjreth.supabase.co/functions/v1/extraction-worker',
    body := '{"source":"cron"}'::jsonb,
    headers := '{"Content-Type":"application/json","X-Worker-Secret":"xtraction-worker-a7f3k9x2m5p8q1w4"}'::jsonb
  );
  $$
);