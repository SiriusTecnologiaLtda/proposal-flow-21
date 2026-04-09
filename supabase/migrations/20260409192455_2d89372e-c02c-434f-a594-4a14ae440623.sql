
-- Fix payment_conditions RLS: swap can_view_proposal args + add project access

DROP POLICY IF EXISTS "Authorized users can insert payments" ON public.payment_conditions;
DROP POLICY IF EXISTS "Authorized users can update payments" ON public.payment_conditions;
DROP POLICY IF EXISTS "Authorized users can delete payments" ON public.payment_conditions;

CREATE POLICY "Authorized users can insert payments"
ON public.payment_conditions
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.id = payment_conditions.proposal_id
      AND (p.created_by = auth.uid() OR can_view_proposal(auth.uid(), p.id))
  )
  OR EXISTS (
    SELECT 1 FROM proposals p
    JOIN projects pr ON pr.proposal_id = p.id
    WHERE p.id = payment_conditions.proposal_id
      AND can_view_project(auth.uid(), pr.id)
  )
);

CREATE POLICY "Authorized users can update payments"
ON public.payment_conditions
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.id = payment_conditions.proposal_id
      AND (p.created_by = auth.uid() OR can_view_proposal(auth.uid(), p.id))
  )
  OR EXISTS (
    SELECT 1 FROM proposals p
    JOIN projects pr ON pr.proposal_id = p.id
    WHERE p.id = payment_conditions.proposal_id
      AND can_view_project(auth.uid(), pr.id)
  )
);

CREATE POLICY "Authorized users can delete payments"
ON public.payment_conditions
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.id = payment_conditions.proposal_id
      AND (p.created_by = auth.uid() OR can_view_proposal(auth.uid(), p.id))
  )
  OR EXISTS (
    SELECT 1 FROM proposals p
    JOIN projects pr ON pr.proposal_id = p.id
    WHERE p.id = payment_conditions.proposal_id
      AND can_view_project(auth.uid(), pr.id)
  )
);
