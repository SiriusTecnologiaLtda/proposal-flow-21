
-- Step 1: Add nullable column first
ALTER TABLE public.sales_targets ADD COLUMN unit_id uuid REFERENCES public.unit_info(id) ON DELETE RESTRICT;

-- Step 2: Populate from sales_team
UPDATE public.sales_targets st
SET unit_id = s.unit_id
FROM public.sales_team s
WHERE st.esn_id = s.id;

-- Step 3: Make it NOT NULL
ALTER TABLE public.sales_targets ALTER COLUMN unit_id SET NOT NULL;

-- Step 4: Update unique constraint to include unit_id
ALTER TABLE public.sales_targets DROP CONSTRAINT IF EXISTS sales_targets_owner_period_scope_key;
ALTER TABLE public.sales_targets ADD CONSTRAINT sales_targets_owner_period_scope_key 
  UNIQUE NULLS NOT DISTINCT (esn_id, year, month, role, category_id, segment_id, unit_id);
