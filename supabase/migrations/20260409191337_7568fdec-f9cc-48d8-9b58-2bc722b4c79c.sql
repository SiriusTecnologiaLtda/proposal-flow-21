
-- Drop existing write policies
DROP POLICY IF EXISTS "Authorized users can insert proposal scope" ON public.proposal_scope_items;
DROP POLICY IF EXISTS "Authorized users can update proposal scope" ON public.proposal_scope_items;
DROP POLICY IF EXISTS "Authorized users can delete proposal scope" ON public.proposal_scope_items;

-- Recreate with project access check
CREATE POLICY "Authorized users can insert proposal scope"
ON public.proposal_scope_items
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.id = proposal_scope_items.proposal_id AND p.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM proposals p
    JOIN projects pr ON pr.proposal_id = p.id
    WHERE p.id = proposal_scope_items.proposal_id
      AND can_view_project(auth.uid(), pr.id)
  )
);

CREATE POLICY "Authorized users can update proposal scope"
ON public.proposal_scope_items
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.id = proposal_scope_items.proposal_id AND p.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM proposals p
    JOIN projects pr ON pr.proposal_id = p.id
    WHERE p.id = proposal_scope_items.proposal_id
      AND can_view_project(auth.uid(), pr.id)
  )
);

CREATE POLICY "Authorized users can delete proposal scope"
ON public.proposal_scope_items
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.id = proposal_scope_items.proposal_id AND p.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM proposals p
    JOIN projects pr ON pr.proposal_id = p.id
    WHERE p.id = proposal_scope_items.proposal_id
      AND can_view_project(auth.uid(), pr.id)
  )
);
