-- 024_client_cantina_fields_rpcs.sql
-- Permitir a anon (cantina app) actualizar campos cantina-específicos del
-- cliente. La policy RLS de `clients` solo da acceso a `authenticated`,
-- así que necesitamos SECURITY DEFINER RPCs.
--
-- Fix bug #9: el modal de perfil del cliente no podía guardar el descuento
-- (silenciosamente rechazado por RLS). También #4c (credit_limit_ref).

CREATE OR REPLACE FUNCTION public.set_client_cantina_discount(
  p_client_id text,
  p_discount_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_client_id IS NULL OR length(btrim(p_client_id)) = 0 THEN
    RAISE EXCEPTION 'client_id requerido';
  END IF;
  -- Validar que el discount, si se pasa, existe + es cantina activo
  IF p_discount_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM discounts d
      WHERE d.id = p_discount_id AND d.is_active = true AND d.is_cantina = true
    ) THEN
      RAISE EXCEPTION 'discount % no existe o no es cantina activo', p_discount_id;
    END IF;
  END IF;
  UPDATE clients SET cantina_discount_id = p_discount_id WHERE id = p_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_client_cantina_discount(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_client_credit_limit(
  p_client_id text,
  p_limit numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_client_id IS NULL OR length(btrim(p_client_id)) = 0 THEN
    RAISE EXCEPTION 'client_id requerido';
  END IF;
  IF p_limit IS NULL OR p_limit < 0 THEN
    RAISE EXCEPTION 'limit debe ser >= 0';
  END IF;
  UPDATE clients SET credit_limit_ref = p_limit WHERE id = p_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_client_credit_limit(text, numeric) TO anon, authenticated;
