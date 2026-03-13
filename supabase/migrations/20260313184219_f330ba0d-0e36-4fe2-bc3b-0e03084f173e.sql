
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor', 'arquiteto', 'gsn');

-- Create enum for proposal status
CREATE TYPE public.proposal_status AS ENUM ('rascunho', 'em_revisao', 'aprovada', 'enviada');

-- Create enum for proposal type
CREATE TYPE public.proposal_type AS ENUM ('projeto', 'banco_de_horas');

-- Create enum for scope type
CREATE TYPE public.scope_type AS ENUM ('detalhado', 'macro');

-- Create enum for sales team role
CREATE TYPE public.sales_role AS ENUM ('esn', 'gsn', 'arquiteto');

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  sales_team_member_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  state_registration TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update clients" ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SALES TEAM ============
CREATE TABLE public.sales_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  role sales_role NOT NULL,
  linked_gsn_id UUID REFERENCES public.sales_team(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_team ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view sales team" ON public.sales_team FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage sales team" ON public.sales_team FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_sales_team_updated_at BEFORE UPDATE ON public.sales_team FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link profiles to sales_team
ALTER TABLE public.profiles ADD CONSTRAINT fk_profiles_sales_team FOREIGN KEY (sales_team_member_id) REFERENCES public.sales_team(id);

-- ============ SCOPE TEMPLATES ============
CREATE TABLE public.scope_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  product TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scope_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view templates" ON public.scope_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage templates" ON public.scope_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_scope_templates_updated_at BEFORE UPDATE ON public.scope_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SCOPE TEMPLATE ITEMS ============
CREATE TABLE public.scope_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.scope_templates(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  default_hours INT NOT NULL DEFAULT 0,
  phase INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.scope_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view template items" ON public.scope_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage template items" ON public.scope_template_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ PROPOSALS ============
CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL UNIQUE,
  type proposal_type NOT NULL DEFAULT 'projeto',
  product TEXT NOT NULL,
  status proposal_status NOT NULL DEFAULT 'rascunho',
  scope_type scope_type NOT NULL DEFAULT 'detalhado',
  client_id UUID NOT NULL REFERENCES public.clients(id),
  esn_id UUID REFERENCES public.sales_team(id),
  gsn_id UUID REFERENCES public.sales_team(id),
  arquiteto_id UUID REFERENCES public.sales_team(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  date_validity DATE,
  hourly_rate NUMERIC NOT NULL DEFAULT 250,
  gp_percentage NUMERIC NOT NULL DEFAULT 20,
  accomp_analyst NUMERIC NOT NULL DEFAULT 15,
  accomp_gp NUMERIC NOT NULL DEFAULT 10,
  travel_local_hours NUMERIC NOT NULL DEFAULT 1,
  travel_trip_hours NUMERIC NOT NULL DEFAULT 4,
  travel_hourly_rate NUMERIC NOT NULL DEFAULT 250,
  num_companies INT NOT NULL DEFAULT 1,
  additional_analyst_rate NUMERIC NOT NULL DEFAULT 280,
  additional_gp_rate NUMERIC NOT NULL DEFAULT 300,
  negotiation TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view proposals" ON public.proposals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create proposals" ON public.proposals FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update proposals" ON public.proposals FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PROPOSAL SCOPE ITEMS ============
CREATE TABLE public.proposal_scope_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.scope_templates(id),
  description TEXT NOT NULL,
  included BOOLEAN NOT NULL DEFAULT false,
  hours NUMERIC NOT NULL DEFAULT 0,
  phase INT NOT NULL DEFAULT 1,
  notes TEXT DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.proposal_scope_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view proposal scope" ON public.proposal_scope_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage proposal scope" ON public.proposal_scope_items FOR ALL TO authenticated USING (true);

-- ============ PROPOSAL MACRO SCOPE ============
CREATE TABLE public.proposal_macro_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  phase INT NOT NULL DEFAULT 1,
  scope TEXT NOT NULL,
  analyst_hours NUMERIC NOT NULL DEFAULT 0,
  gp_hours NUMERIC NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.proposal_macro_scope ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view macro scope" ON public.proposal_macro_scope FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage macro scope" ON public.proposal_macro_scope FOR ALL TO authenticated USING (true);

-- ============ PAYMENT CONDITIONS ============
CREATE TABLE public.payment_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  installment INT NOT NULL,
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.payment_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view payments" ON public.payment_conditions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage payments" ON public.payment_conditions FOR ALL TO authenticated USING (true);

-- ============ PRODUCTS TABLE ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ UNIT INFO (settings) ============
CREATE TABLE public.unit_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT,
  contact TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.unit_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view unit info" ON public.unit_info FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage unit info" ON public.unit_info FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
