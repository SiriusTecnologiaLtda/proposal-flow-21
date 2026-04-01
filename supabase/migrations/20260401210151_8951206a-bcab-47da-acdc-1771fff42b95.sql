
-- Add part_number and external_code to software_catalog_items
ALTER TABLE public.software_catalog_items
  ADD COLUMN IF NOT EXISTS part_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS external_code text DEFAULT NULL;

-- Add client_id, unit_id, raw_client_name, raw_unit_name to software_proposals
ALTER TABLE public.software_proposals
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.unit_info(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS raw_client_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS raw_unit_name text DEFAULT NULL;
