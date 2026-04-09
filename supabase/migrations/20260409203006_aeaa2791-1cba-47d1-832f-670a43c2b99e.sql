
CREATE OR REPLACE FUNCTION public.can_view_proposal_v2(_user_id uuid, _proposal_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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

  -- Direct match by email (same as v1 for arquiteto_id)
  IF EXISTS (
    SELECT 1
      FROM auth.users u
      JOIN public.sales_team st ON lower(st.email) = lower(u.email)
     WHERE u.id = _user_id
       AND st.id = _proposal.arquiteto_id
  ) THEN
    RETURN true;
  END IF;

  -- Hierarchical expansion via assignments
  SELECT p.sales_team_member_id INTO _member_id
    FROM public.profiles p
   WHERE p.user_id = _user_id;

  IF _member_id IS NULL THEN
    RETURN false;
  END IF;

  _visible_ids := public.get_visible_sales_ids_v2(_member_id);

  -- Proposal visible if esn_id or gsn_id is in the user's hierarchy
  IF _proposal.esn_id = ANY(_visible_ids) OR _proposal.gsn_id = ANY(_visible_ids) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
