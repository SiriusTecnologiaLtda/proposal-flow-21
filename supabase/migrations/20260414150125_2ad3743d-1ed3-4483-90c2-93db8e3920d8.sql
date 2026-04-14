-- Add audit columns for import traceability
ALTER TABLE public.sales_targets
  ADD COLUMN IF NOT EXISTS original_category text,
  ADD COLUMN IF NOT EXISTS original_segment text,
  ADD COLUMN IF NOT EXISTS original_unit text,
  ADD COLUMN IF NOT EXISTS original_member text;

-- Add comment for documentation
COMMENT ON COLUMN public.sales_targets.original_category IS 'Original category name from imported spreadsheet (audit/traceability)';
COMMENT ON COLUMN public.sales_targets.original_segment IS 'Original segment name from imported spreadsheet (audit/traceability)';
COMMENT ON COLUMN public.sales_targets.original_unit IS 'Original unit code/name from imported spreadsheet (audit/traceability)';
COMMENT ON COLUMN public.sales_targets.original_member IS 'Original member code/name from imported spreadsheet (audit/traceability)';