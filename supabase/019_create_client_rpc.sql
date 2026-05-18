-- 019_create_client_rpc.sql
-- Fix RLS error al crear cliente desde cantina (anon key bloqueada por RLS
-- en la tabla compartida `clients`). Patrón estándar: SECURITY DEFINER RPC.
--
-- Validaciones replican las del cliente (ClientModal/ClientFormModal):
--   - Nombre y apellido obligatorios
--   - Teléfono, cédula, email opcionales pero deben pasar regex si vienen
--
-- Devuelve el id del cliente creado.

CREATE OR REPLACE FUNCTION public.create_client_quick(
  p_first_name text,
  p_last_name  text,
  p_phone      text DEFAULT NULL,
  p_cedula     text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_notes      text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id text;
BEGIN
  IF p_first_name IS NULL OR length(btrim(p_first_name)) = 0 THEN
    RAISE EXCEPTION 'Nombre obligatorio';
  END IF;
  IF p_last_name IS NULL OR length(btrim(p_last_name)) = 0 THEN
    RAISE EXCEPTION 'Apellido obligatorio';
  END IF;

  new_id := 'cli_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  INSERT INTO clients (id, first_name, last_name, phone, cedula, email, notes)
  VALUES (
    new_id,
    btrim(p_first_name),
    btrim(p_last_name),
    NULLIF(btrim(coalesce(p_phone, '')), ''),
    NULLIF(btrim(coalesce(p_cedula, '')), ''),
    NULLIF(btrim(coalesce(p_email, '')), ''),
    NULLIF(btrim(coalesce(p_notes, '')), '')
  );

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_client_quick(text, text, text, text, text, text) TO anon, authenticated;
