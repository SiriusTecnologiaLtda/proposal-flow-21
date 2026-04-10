
-- =============================================
-- STEP 4: Document legacy — mark v1 functions as deprecated
-- No removals, only documentation
-- =============================================

COMMENT ON FUNCTION public.can_view_proposal(uuid, uuid) IS 
  'DEPRECATED 2026-04-10 — Replaced by can_view_proposal_v2. Uses email-based matching. Kept for rollback safety. Safe to DROP after 2026-05-10.';

COMMENT ON FUNCTION public.can_view_project(uuid, uuid) IS 
  'DEPRECATED 2026-04-10 — Replaced by can_view_project_v2. Uses email-based matching. Kept for rollback safety. Safe to DROP after 2026-05-10.';

COMMENT ON FUNCTION public.is_client_esn(uuid, uuid) IS 
  'DEPRECATED 2026-04-10 — Uses email-based matching (auth.users → sales_team). Should be replaced by structural resolution via profiles.sales_team_member_id. Still referenced by RLS on clients (UPDATE) and sales_targets (SELECT).';

-- Document legacy columns
COMMENT ON COLUMN public.sales_team.linked_gsn_id IS 
  'DEPRECATED 2026-04-10 — Replaced by sales_team_assignments.reports_to_id. Still used by legacy scope comparison hook and SalesTeamMemberDialog. Safe to DROP after full v2 migration.';

COMMENT ON COLUMN public.sales_team.unit_id IS 
  'DEPRECATED 2026-04-10 — Replaced by sales_team_assignments.unit_id (multi-unit). Still used by SalesTeamMemberDialog and ProposalsList unit resolution fallback. Safe to DROP after full v2 migration.';
