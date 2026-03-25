
-- Projects table
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  arquiteto_id uuid REFERENCES public.sales_team(id),
  created_by uuid NOT NULL,
  product text NOT NULL DEFAULT '',
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Project scope items (same structure as proposal_scope_items)
CREATE TABLE public.project_scope_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.scope_templates(id),
  parent_id uuid REFERENCES public.project_scope_items(id),
  description text NOT NULL,
  included boolean NOT NULL DEFAULT false,
  hours numeric NOT NULL DEFAULT 0,
  phase integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  notes text DEFAULT ''
);

-- Project attachments (file storage)
CREATE TABLE public.project_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer DEFAULT 0,
  mime_type text DEFAULT '',
  description text DEFAULT '',
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger for projects
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_scope_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_attachments ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Authenticated users can view projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'arquiteto'));
CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Project scope items policies
CREATE POLICY "Authenticated users can view project scope" ON public.project_scope_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert project scope" ON public.project_scope_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update project scope" ON public.project_scope_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete project scope" ON public.project_scope_items FOR DELETE TO authenticated USING (true);

-- Project attachments policies
CREATE POLICY "Authenticated users can view project attachments" ON public.project_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert project attachments" ON public.project_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update project attachments" ON public.project_attachments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can delete project attachments" ON public.project_attachments FOR DELETE TO authenticated USING (true);
