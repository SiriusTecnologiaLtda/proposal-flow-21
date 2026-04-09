
-- Simplificar constraint: membro + unidade (sem papel)
DROP INDEX IF EXISTS uq_sta_active_member_unit_role;
CREATE UNIQUE INDEX uq_sta_active_member_unit 
  ON public.sales_team_assignments(member_id, unit_id) 
  WHERE active = true;
