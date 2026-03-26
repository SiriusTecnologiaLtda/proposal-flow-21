CREATE OR REPLACE FUNCTION public.ensure_payment_due_date_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    NEW.due_date := (CURRENT_DATE + INTERVAL '30 days')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_payment_conditions_due_date_default ON public.payment_conditions;

CREATE TRIGGER set_payment_conditions_due_date_default
BEFORE INSERT OR UPDATE ON public.payment_conditions
FOR EACH ROW
EXECUTE FUNCTION public.ensure_payment_due_date_default();