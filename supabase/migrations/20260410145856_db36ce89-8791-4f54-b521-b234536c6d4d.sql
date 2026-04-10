
-- =============================================
-- STEP 2: Remove email fallback from v2 functions
-- All profiles now have sales_team_member_id linked
-- =============================================

-- 1. can_view_proposal_v2: remove email-based arquiteto check
CREATE OR REPLACE FUNCTION public.can_view_proposal_v2(_user_id uuid, _proposal_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _member_id uuid;
  _visible_ids uuid[];
  _proposal record;
BEGIN
  -- Admin: unrestricted
  IF public.has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  -- Fetch proposal
  SELECT created_by, esn_id, gsn_id, arquiteto_id
    INTO _proposal
    FROM public.proposals
   WHERE id = _proposal_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Creator always has access
  IF _proposal.created_by = _user_id THEN
    RETURN true;
  END IF;

  -- Resolve user → sales_team_member_id via profile
  SELECT p.sales_team_member_id INTO _member_id
    FROM public.profiles p
   WHERE p.user_id = _user_id;

  IF _member_id IS NULL THEN
    RETURN false;
  END IF;

  -- Arquiteto: structural match
  IF _proposal.arquiteto_id IS NOT NULL AND _member_id = _proposal.arquiteto_id THEN
    RETURN true;
  END IF;

  -- Hierarchical expansion via assignments
  _visible_ids := public.get_visible_sales_ids_v2(_member_id);

  -- Proposal visible if esn_id or gsn_id is in the user's hierarchy
  IF _proposal.esn_id = ANY(_visible_ids) OR _proposal.gsn_id = ANY(_visible_ids) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- 2. can_view_project_v2: remove email-based arquiteto check
CREATE OR REPLACE FUNCTION public.can_view_project_v2(_user_id uuid, _project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _member_id uuid;
  _visible_ids uuid[];
  _project record;
BEGIN
  -- 1. Admin: unrestricted
  IF public.has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  -- 2. Fetch project with client commercial links
  SELECT p.created_by, p.arquiteto_id, c.esn_id, c.gsn_id
    INTO _project
    FROM public.projects p
    JOIN public.clients c ON c.id = p.client_id
   WHERE p.id = _project_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 3. Creator always has access
  IF _project.created_by = _user_id THEN
    RETURN true;
  END IF;

  -- 4. Resolve user → sales_team_member_id via profile
  SELECT p.sales_team_member_id INTO _member_id
    FROM public.profiles p
   WHERE p.user_id = _user_id;

  IF _member_id IS NULL THEN
    RETURN false;
  END IF;

  -- 5. Arquiteto: structural match only
  IF _project.arquiteto_id IS NOT NULL AND _member_id = _project.arquiteto_id THEN
    RETURN true;
  END IF;

  -- 6. Hierarchical expansion via assignments
  _visible_ids := public.get_visible_sales_ids_v2(_member_id);

  -- Project visible if client's esn_id or gsn_id is in the user's hierarchy
  IF _project.esn_id = ANY(_visible_ids) OR _project.gsn_id = ANY(_visible_ids) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;
