DROP POLICY IF EXISTS "Users can update clients" ON public.clients;
CREATE POLICY "Users can update clients"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.sales_team st
      JOIN auth.users u ON lower(u.email) = lower(st.email)
      WHERE u.id = auth.uid() AND st.id = clients.esn_id
    )
  );