
-- =============================================
-- FASE 0: FUNDAÇÃO — sales_team_assignments
-- =============================================

-- 1. Criar tabela de vínculos comerciais por unidade
CREATE TABLE public.sales_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.sales_team(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.unit_info(id) ON DELETE CASCADE,
  role sales_role NOT NULL,
  reports_to_id uuid REFERENCES public.sales_team_assignments(id) ON DELETE SET NULL,
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_sta_member ON public.sales_team_assignments(member_id);
CREATE INDEX idx_sta_unit ON public.sales_team_assignments(unit_id);
CREATE INDEX idx_sta_role ON public.sales_team_assignments(role);
CREATE INDEX idx_sta_active ON public.sales_team_assignments(active);
CREATE INDEX idx_sta_reports_to ON public.sales_team_assignments(reports_to_id);

-- Constraint: mesmo membro não pode ter dois vínculos ativos com mesmo papel na mesma unidade
CREATE UNIQUE INDEX uq_sta_active_member_unit_role 
  ON public.sales_team_assignments(member_id, unit_id, role) 
  WHERE active = true;

-- Trigger updated_at
CREATE TRIGGER update_sta_updated_at
  BEFORE UPDATE ON public.sales_team_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RLS
ALTER TABLE public.sales_team_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view assignments"
  ON public.sales_team_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage assignments"
  ON public.sales_team_assignments FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Funções auxiliares v2 (NÃO ATIVAS em produção ainda)

-- Retorna as unidades (IDs) de um membro
CREATE OR REPLACE FUNCTION public.get_member_units_v2(_member_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(unit_id), '{}')
  FROM public.sales_team_assignments
  WHERE member_id = _member_id AND active = true;
$$;

-- Retorna os IDs de membros visíveis para um dado membro, 
-- considerando hierarquia (dsn vê gsn+esn+arq, gsn vê esn+arq sob si)
CREATE OR REPLACE FUNCTION public.get_visible_sales_ids_v2(_member_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _roles sales_role[];
  _result uuid[];
  _assignment_ids uuid[];
BEGIN
  -- Obter papéis ativos do membro
  SELECT array_agg(DISTINCT role) INTO _roles
  FROM public.sales_team_assignments
  WHERE member_id = _member_id AND active = true;

  IF _roles IS NULL THEN
    RETURN ARRAY[_member_id];
  END IF;

  -- DSN: vê todos os membros nas suas unidades
  IF 'dsn' = ANY(_roles) THEN
    SELECT COALESCE(array_agg(DISTINCT sa.member_id), ARRAY[_member_id])
    INTO _result
    FROM public.sales_team_assignments sa
    WHERE sa.active = true
      AND sa.unit_id IN (
        SELECT unit_id FROM public.sales_team_assignments
        WHERE member_id = _member_id AND active = true
      );
    RETURN _result;
  END IF;

  -- GSN: vê quem reporta a si (direto)
  IF 'gsn' = ANY(_roles) THEN
    -- Pegar os assignment_ids do GSN
    SELECT array_agg(id) INTO _assignment_ids
    FROM public.sales_team_assignments
    WHERE member_id = _member_id AND active = true AND role = 'gsn';
    
    SELECT COALESCE(array_agg(DISTINCT sa.member_id), '{}')
    INTO _result
    FROM public.sales_team_assignments sa
    WHERE sa.active = true
      AND sa.reports_to_id = ANY(_assignment_ids);
    
    RETURN array_cat(ARRAY[_member_id], _result);
  END IF;

  -- ESN / Arquiteto: vê apenas a si
  RETURN ARRAY[_member_id];
END;
$$;
