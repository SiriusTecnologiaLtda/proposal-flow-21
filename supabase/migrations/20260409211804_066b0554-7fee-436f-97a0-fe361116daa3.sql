
-- Create can_view_project_v2: hierarchical visibility for projects
-- Uses sales_team_assignments for scope expansion
-- Resolves arquiteto via profile→sales_team_member_id (structural, preferred)
-- Falls back to email-based match for arquitetos without profile link (temporary compatibility)

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

  -- 4. Resolve user → sales_team_member_id via profile (structural path)
  SELECT p.sales_team_member_id INTO _member_id
    FROM public.profiles p
   WHERE p.user_id = _user_id;

  -- 5. Arquiteto check: structural first, email fallback for compatibility
  IF _project.arquiteto_id IS NOT NULL THEN
    -- 5a. Structural: profile.sales_team_member_id matches arquiteto_id
    IF _member_id IS NOT NULL AND _member_id = _project.arquiteto_id THEN
      RETURN true;
    END IF;

    -- 5b. Temporary compatibility: email-based match for arquitetos
    --     without profile→sales_team_member_id link.
    --     TODO: Remove this fallback once all arquitetos have profile links.
    IF EXISTS (
      SELECT 1
        FROM auth.users u
        JOIN public.sales_team st ON lower(st.email) = lower(u.email)
       WHERE u.id = _user_id
         AND st.id = _project.arquiteto_id
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- 6. Hierarchical expansion via assignments
  IF _member_id IS NULL THEN
    RETURN false;
  END IF;

  _visible_ids := public.get_visible_sales_ids_v2(_member_id);

  -- Project visible if client's esn_id or gsn_id is in the user's hierarchy
  IF _project.esn_id = ANY(_visible_ids) OR _project.gsn_id = ANY(_visible_ids) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;
