-- 016_event_items_recalc_trigger.sql
-- Auto-recalc events.total_owed_ref cuando event_items cambia.
-- Mantiene la columna stored en sync con los items reales sin necesidad de
-- llamar manualmente a recalc_event_total_owed desde el frontend.

CREATE OR REPLACE FUNCTION public.event_items_recalc_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.recalc_event_total_owed(OLD.event_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalc_event_total_owed(NEW.event_id);

  -- Edge case: si cambio el event_id en un UPDATE, recalc el viejo tambien
  IF (TG_OP = 'UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id) THEN
    PERFORM public.recalc_event_total_owed(OLD.event_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER event_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.event_items
FOR EACH ROW
EXECUTE FUNCTION public.event_items_recalc_trigger();
