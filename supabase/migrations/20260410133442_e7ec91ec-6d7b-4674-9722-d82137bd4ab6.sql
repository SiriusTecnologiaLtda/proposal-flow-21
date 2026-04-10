
-- Step 1: Add crm_code column to sales_team_assignments
ALTER TABLE public.sales_team_assignments 
ADD COLUMN crm_code text DEFAULT NULL;

-- Step 2: Migrate CRM codes that have a matching assignment (same member + same unit)
UPDATE public.sales_team_assignments sa
SET crm_code = c.code
FROM public.sales_team_crm_codes c
WHERE c.sales_team_id = sa.member_id
  AND c.unit_id = sa.unit_id
  AND c.unit_id IS NOT NULL;

-- Step 3: Migrate CRM codes without unit_id to the member's primary assignment
UPDATE public.sales_team_assignments sa
SET crm_code = c.code
FROM public.sales_team_crm_codes c
WHERE c.sales_team_id = sa.member_id
  AND c.unit_id IS NULL
  AND sa.is_primary = true
  AND sa.crm_code IS NULL;

-- Step 4: Create index for CRM code lookups (used by import engine)
CREATE INDEX idx_sales_team_assignments_crm_code 
ON public.sales_team_assignments(crm_code) 
WHERE crm_code IS NOT NULL;
