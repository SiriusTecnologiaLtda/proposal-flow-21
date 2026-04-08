ALTER TABLE public.sales_targets DROP CONSTRAINT IF EXISTS sales_targets_composite_unique;
ALTER TABLE public.sales_targets DROP CONSTRAINT IF EXISTS sales_targets_owner_period_scope_key;