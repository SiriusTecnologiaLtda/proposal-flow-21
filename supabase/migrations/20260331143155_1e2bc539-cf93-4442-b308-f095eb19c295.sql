
-- Table for per-proposal service items (copy from template with editable params)
CREATE TABLE public.proposal_service_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  source_item_id UUID REFERENCES public.proposal_type_service_items(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  rounding_factor INTEGER NOT NULL DEFAULT 8,
  is_base_scope BOOLEAN NOT NULL DEFAULT false,
  additional_pct NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC NOT NULL DEFAULT 250,
  golive_pct NUMERIC NOT NULL DEFAULT 0,
  related_item_id UUID REFERENCES public.proposal_service_items(id) ON DELETE SET NULL,
  calculated_hours NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_service_items ENABLE ROW LEVEL SECURITY;

-- View: all authenticated
CREATE POLICY "Authenticated users can view proposal service items"
ON public.proposal_service_items FOR SELECT TO authenticated
USING (true);

-- Insert: admin or proposal owner
CREATE POLICY "Authorized users can insert proposal service items"
ON public.proposal_service_items FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_service_items.proposal_id AND p.created_by = auth.uid())
);

-- Update: admin or proposal owner
CREATE POLICY "Authorized users can update proposal service items"
ON public.proposal_service_items FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_service_items.proposal_id AND p.created_by = auth.uid())
);

-- Delete: admin or proposal owner
CREATE POLICY "Authorized users can delete proposal service items"
ON public.proposal_service_items FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_service_items.proposal_id AND p.created_by = auth.uid())
);

-- Trigger to update updated_at
CREATE TRIGGER update_proposal_service_items_updated_at
  BEFORE UPDATE ON public.proposal_service_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
