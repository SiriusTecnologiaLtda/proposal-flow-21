ALTER TABLE public.sales_targets
ADD COLUMN role public.sales_role NOT NULL DEFAULT 'esn';