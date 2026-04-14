
-- Reconciliation: safely remove all extraction cron schedules
-- Re-scheduling will be done outside of migrations to avoid secret exposure in git

-- Safely unschedule extraction-worker-poll (ignore if not exists)
DO $$
BEGIN
  PERFORM cron.unschedule('extraction-worker-poll');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'extraction-worker-poll not found, skipping';
END;
$$;

-- Safely unschedule extraction-health-check
DO $$
BEGIN
  PERFORM cron.unschedule('extraction-health-check');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'extraction-health-check not found, skipping';
END;
$$;

-- IMPORTANT: cron schedules with secrets must NEVER be in migrations.
-- Use the Supabase insert/SQL tool to create cron jobs at deploy time.
-- This ensures secrets never appear in version-controlled files.
