
CREATE TABLE public.proposal_type_service_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_type_id UUID NOT NULL REFERENCES public.proposal_types(id) ON DELETE CASCADE,
  related_item_id UUID REFERENCES public.proposal_type_service_items(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  rounding_factor INTEGER NOT NULL DEFAULT 8,
  is_base_scope BOOLEAN NOT NULL DEFAULT false,
  additional_pct NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_type_service_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view service items"
  ON public.proposal_type_service_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage service items"
  ON public.proposal_type_service_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Migrate base scope items from existing analyst_label
INSERT INTO public.proposal_type_service_items (proposal_type_id, label, rounding_factor, is_base_scope, additional_pct, sort_order)
SELECT id, analyst_label, rounding_factor, true, 0, 0
FROM public.proposal_types;

-- Migrate non-base items from existing gp_label with default 20% additional
INSERT INTO public.proposal_type_service_items (proposal_type_id, label, rounding_factor, is_base_scope, additional_pct, sort_order, related_item_id)
SELECT pt.id, pt.gp_label, pt.rounding_factor, false, 20, 1, si.id
FROM public.proposal_types pt
JOIN public.proposal_type_service_items si ON si.proposal_type_id = pt.id AND si.is_base_scope = true;
