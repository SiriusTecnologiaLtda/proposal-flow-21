
-- =============================================
-- Phase 1: Software Proposals Foundation Tables
-- =============================================

-- 1. Config table (single-row)
CREATE TABLE public.software_proposal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_provider text NOT NULL DEFAULT 'lovable_ai',
  extraction_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  confidence_threshold numeric NOT NULL DEFAULT 0.7,
  auto_create_issues_below numeric NOT NULL DEFAULT 0.5,
  auto_extract_on_upload boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.software_proposal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage software proposal config"
  ON public.software_proposal_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default config row
INSERT INTO public.software_proposal_config (id) VALUES (gen_random_uuid());

-- 2. Main software_proposals table
CREATE TABLE public.software_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending_extraction',
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_hash text UNIQUE,
  origin text NOT NULL DEFAULT 'other',
  origin_detail text,
  vendor_name text,
  client_name text,
  proposal_date date,
  validity_date date,
  total_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  payment_type text,
  first_due_date date,
  installment_count integer,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_duration_months integer,
  discount_notes text,
  extraction_provider text,
  extraction_model text,
  extraction_confidence numeric,
  extracted_at timestamptz,
  validated_at timestamptz,
  validated_by uuid,
  uploaded_by uuid NOT NULL,
  raw_extracted_json jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.software_proposals ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins full access on software_proposals"
  ON public.software_proposals FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Non-admin: can only see own uploads
CREATE POLICY "Users can view own software_proposals"
  ON public.software_proposals FOR SELECT
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Non-admin: can insert own records
CREATE POLICY "Users can insert own software_proposals"
  ON public.software_proposals FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- Non-admin: can update own records
CREATE POLICY "Users can update own software_proposals"
  ON public.software_proposals FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- 3. software_proposal_items
CREATE TABLE public.software_proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  software_proposal_id uuid NOT NULL REFERENCES public.software_proposals(id) ON DELETE CASCADE,
  catalog_item_id uuid,
  item_type text NOT NULL DEFAULT 'other',
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  recurrence text NOT NULL DEFAULT 'one_time',
  cost_classification text NOT NULL DEFAULT 'opex',
  discount_pct numeric NOT NULL DEFAULT 0,
  discount_value numeric NOT NULL DEFAULT 0,
  discount_duration_months integer,
  confidence_score numeric,
  matched_confidence numeric,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.software_proposal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on sw_proposal_items"
  ON public.software_proposal_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own sw_proposal_items"
  ON public.software_proposal_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.software_proposals sp
    WHERE sp.id = software_proposal_items.software_proposal_id
      AND sp.uploaded_by = auth.uid()
  ));

CREATE POLICY "Users can insert own sw_proposal_items"
  ON public.software_proposal_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.software_proposals sp
    WHERE sp.id = software_proposal_items.software_proposal_id
      AND sp.uploaded_by = auth.uid()
  ));

CREATE POLICY "Users can update own sw_proposal_items"
  ON public.software_proposal_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.software_proposals sp
    WHERE sp.id = software_proposal_items.software_proposal_id
      AND sp.uploaded_by = auth.uid()
  ));

-- 4. software_catalog_items
CREATE TABLE public.software_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other',
  vendor_name text,
  default_recurrence text NOT NULL DEFAULT 'one_time',
  default_cost_classification text NOT NULL DEFAULT 'opex',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.software_catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on sw_catalog_items"
  ON public.software_catalog_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view active sw_catalog_items"
  ON public.software_catalog_items FOR SELECT
  TO authenticated
  USING (true);

-- 5. software_catalog_aliases
CREATE TABLE public.software_catalog_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES public.software_catalog_items(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.software_catalog_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on sw_catalog_aliases"
  ON public.software_catalog_aliases FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view sw_catalog_aliases"
  ON public.software_catalog_aliases FOR SELECT
  TO authenticated
  USING (true);

-- 6. extraction_issues
CREATE TABLE public.extraction_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  software_proposal_id uuid NOT NULL REFERENCES public.software_proposals(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.software_proposal_items(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  extracted_value text,
  corrected_value text,
  issue_type text NOT NULL DEFAULT 'low_confidence',
  status text NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.extraction_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on extraction_issues"
  ON public.extraction_issues FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own extraction_issues"
  ON public.extraction_issues FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.software_proposals sp
    WHERE sp.id = extraction_issues.software_proposal_id
      AND sp.uploaded_by = auth.uid()
  ));

CREATE POLICY "Users can update own extraction_issues"
  ON public.extraction_issues FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.software_proposals sp
    WHERE sp.id = extraction_issues.software_proposal_id
      AND sp.uploaded_by = auth.uid()
  ));

-- 7. extraction_corrections_log
CREATE TABLE public.extraction_corrections_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  software_proposal_id uuid NOT NULL REFERENCES public.software_proposals(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.software_proposal_items(id) ON DELETE CASCADE,
  field_path text NOT NULL,
  original_value text,
  corrected_value text,
  corrected_by uuid NOT NULL,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.extraction_corrections_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on extraction_corrections_log"
  ON public.extraction_corrections_log FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own corrections"
  ON public.extraction_corrections_log FOR INSERT
  TO authenticated
  WITH CHECK (corrected_by = auth.uid());

CREATE POLICY "Users can view own corrections"
  ON public.extraction_corrections_log FOR SELECT
  TO authenticated
  USING (corrected_by = auth.uid());

-- Add FK for catalog_item_id on items table (deferred so catalog table exists)
ALTER TABLE public.software_proposal_items
  ADD CONSTRAINT software_proposal_items_catalog_item_id_fkey
  FOREIGN KEY (catalog_item_id) REFERENCES public.software_catalog_items(id) ON DELETE SET NULL;

-- updated_at triggers
CREATE TRIGGER update_software_proposals_updated_at
  BEFORE UPDATE ON public.software_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_software_catalog_items_updated_at
  BEFORE UPDATE ON public.software_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for software proposal PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('software-proposal-pdfs', 'software-proposal-pdfs', false);

-- Storage RLS: admins full access, users can manage own files
CREATE POLICY "Admins full access on sw_pdf_bucket"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'software-proposal-pdfs' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'software-proposal-pdfs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can upload own sw_pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'software-proposal-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own sw_pdfs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'software-proposal-pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);
