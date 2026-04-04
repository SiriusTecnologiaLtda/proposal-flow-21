DO $$
DECLARE
  servicos_segment_id uuid;
BEGIN
  SELECT id
    INTO servicos_segment_id
  FROM public.software_segments
  WHERE upper(translate(name, 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) = 'SERVICOS'
  LIMIT 1;

  IF servicos_segment_id IS NOT NULL THEN
    UPDATE public.sales_targets
       SET segment_id = servicos_segment_id
     WHERE segment_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.sales_targets
  DROP CONSTRAINT IF EXISTS sales_targets_esn_id_year_month_key;

DROP INDEX IF EXISTS public.sales_targets_esn_id_year_month_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_targets_owner_period_scope_key'
      AND conrelid = 'public.sales_targets'::regclass
  ) THEN
    ALTER TABLE public.sales_targets
      ADD CONSTRAINT sales_targets_owner_period_scope_key
      UNIQUE NULLS NOT DISTINCT (esn_id, year, month, role, category_id, segment_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_targets_import_lookup
  ON public.sales_targets (year, esn_id, role, category_id, segment_id, month);