
ALTER TABLE public.sales_targets
ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

UPDATE public.sales_targets
SET category_id = '0c39a3e8-f5fe-470c-be39-72279260f113';
