
-- Table to store customizable permissions per role
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  resource text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role, resource)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read permissions (needed for nav filtering)
CREATE POLICY "Authenticated users can view role permissions"
ON public.role_permissions FOR SELECT TO authenticated USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage role permissions"
ON public.role_permissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed default permissions
INSERT INTO public.role_permissions (role, resource) VALUES
  ('admin', 'dashboard'), ('admin', 'propostas'), ('admin', 'clientes'),
  ('admin', 'unidades'), ('admin', 'templates'), ('admin', 'produtos-categorias'),
  ('admin', 'time'), ('admin', 'configuracoes'),
  ('vendedor', 'dashboard'), ('vendedor', 'propostas'), ('vendedor', 'clientes'),
  ('gsn', 'dashboard'), ('gsn', 'propostas'), ('gsn', 'clientes'), ('gsn', 'time'),
  ('arquiteto', 'dashboard'), ('arquiteto', 'propostas'), ('arquiteto', 'clientes');
