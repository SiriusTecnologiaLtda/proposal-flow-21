
DROP POLICY "Users can update proposals" ON public.proposals;
CREATE POLICY "Users can update proposals" ON public.proposals
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR has_role(auth.uid(), 'admin')
    OR can_view_proposal(auth.uid(), id)
  );
