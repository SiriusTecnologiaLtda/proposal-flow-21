
ALTER TABLE public.sales_targets
ADD COLUMN segment_id uuid REFERENCES public.software_segments(id) ON DELETE SET NULL;

UPDATE public.sales_targets
SET segment_id = 'fbf10084-c386-43ba-9934-170e4911225c';
