ALTER TABLE public.api_integrations
  ADD COLUMN pagination_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN pagination_type text NOT NULL DEFAULT 'offset_limit',
  ADD COLUMN pagination_param_offset text NOT NULL DEFAULT 'offset',
  ADD COLUMN pagination_param_limit text NOT NULL DEFAULT 'limit',
  ADD COLUMN pagination_page_size integer NOT NULL DEFAULT 200;