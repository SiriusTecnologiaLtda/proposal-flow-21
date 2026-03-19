
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS department text DEFAULT '',
  ADD COLUMN IF NOT EXISTS position text DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
