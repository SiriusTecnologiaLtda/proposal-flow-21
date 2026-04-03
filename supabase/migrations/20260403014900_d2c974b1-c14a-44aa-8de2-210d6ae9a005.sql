ALTER TABLE public.google_integrations
ADD COLUMN IF NOT EXISTS software_proposals_folder_id text DEFAULT '';