
ALTER TABLE public.scope_template_items 
ADD COLUMN parent_id uuid REFERENCES public.scope_template_items(id) ON DELETE CASCADE DEFAULT NULL;

ALTER TABLE public.scope_template_items DROP COLUMN phase;
