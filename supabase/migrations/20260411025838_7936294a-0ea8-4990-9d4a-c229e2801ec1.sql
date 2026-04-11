ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS main_pain text,
  ADD COLUMN IF NOT EXISTS objectives jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS current_scenario text,
  ADD COLUMN IF NOT EXISTS why_act_now text,
  ADD COLUMN IF NOT EXISTS solution_summary text,
  ADD COLUMN IF NOT EXISTS solution_how text;