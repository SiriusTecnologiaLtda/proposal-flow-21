
-- Create a SECURITY DEFINER function to safely get display names
-- without exposing sensitive profile fields
CREATE OR REPLACE FUNCTION public.get_profile_display_names(_user_ids uuid[])
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name
  FROM public.profiles p
  WHERE p.user_id = ANY(_user_ids);
$$;
