
ALTER TABLE public.scope_templates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'em_revisao',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_name text DEFAULT '';

-- Update existing templates to 'aprovado' so they remain usable
UPDATE public.scope_templates SET status = 'aprovado' WHERE status = 'em_revisao';
