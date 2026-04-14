UPDATE public.software_proposals
SET status = 'error',
    notes = COALESCE(notes || ' | ', '') || 'Auto-recuperado: extração excedeu o tempo limite e foi marcada como erro.',
    updated_at = now()
WHERE status = 'extracting'
  AND updated_at < now() - interval '10 minutes';