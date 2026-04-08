
-- 1. sales_team: unique on code
ALTER TABLE public.sales_team ADD CONSTRAINT sales_team_code_unique UNIQUE (code);

-- 2. clients: unique on (code, store_code) — store_code can be null/empty, coalesce to empty
CREATE UNIQUE INDEX clients_code_store_unique ON public.clients (code, COALESCE(store_code, ''));

-- 3. sales_team_crm_codes: unique on (code, sales_team_id)
ALTER TABLE public.sales_team_crm_codes ADD CONSTRAINT sales_team_crm_codes_code_member_unique UNIQUE (code, sales_team_id);

-- 4. sales_targets: unique on composite key
ALTER TABLE public.sales_targets ADD CONSTRAINT sales_targets_composite_unique UNIQUE (esn_id, year, month, role, category_id, segment_id);
