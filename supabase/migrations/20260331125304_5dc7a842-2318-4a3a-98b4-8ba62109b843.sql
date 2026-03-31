
-- Fix: Change profiles_safe to SECURITY INVOKER (default for views, but explicit)
DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe 
  WITH (security_invoker = true)
AS
  SELECT id, user_id, display_name, email, phone, avatar_url, 
         sales_team_member_id, is_cra, created_at, updated_at
  FROM public.profiles;
