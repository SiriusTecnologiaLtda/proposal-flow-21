-- Revoke EXECUTE from public roles to prevent privilege escalation
REVOKE EXECUTE ON FUNCTION public.claim_extraction_jobs(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_extraction_jobs(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_extraction_jobs(integer) FROM authenticated;

-- Grant only to service_role (used by extraction-worker edge function)
GRANT EXECUTE ON FUNCTION public.claim_extraction_jobs(integer) TO service_role;