
-- =============================================
-- STEP 3: Deprecate sales_team_crm_codes (read-only)
-- Secondary CRM codes confirmed obsolete
-- Table to be dropped after 30-day observation
-- =============================================

-- Remove mutation policies
DROP POLICY IF EXISTS "Admins can manage crm codes" ON public.sales_team_crm_codes;
DROP POLICY IF EXISTS "Admins can insert crm codes" ON public.sales_team_crm_codes;
DROP POLICY IF EXISTS "Admins can update crm codes" ON public.sales_team_crm_codes;
DROP POLICY IF EXISTS "Admins can delete crm codes" ON public.sales_team_crm_codes;

-- Keep read-only policy
DROP POLICY IF EXISTS "Authenticated users can view crm codes" ON public.sales_team_crm_codes;
CREATE POLICY "Read-only deprecated table"
  ON public.sales_team_crm_codes FOR SELECT TO authenticated
  USING (true);

-- Mark as deprecated
COMMENT ON TABLE public.sales_team_crm_codes IS 'DEPRECATED 2026-04-10 — Replaced by sales_team_assignments.crm_code. Read-only backup. Safe to DROP after 2026-05-10.';
