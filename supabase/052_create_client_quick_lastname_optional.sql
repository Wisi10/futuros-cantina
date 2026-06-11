-- Migration 052: hacer last_name opcional en create_client_quick.
-- Aplicada via PAT 2026-06-11. Este archivo es audit trail.
--
-- El form de cliente solo requiere first_name (los demás campos son opcionales).
-- RPC anterior fallaba con "Apellido obligatorio" cuando se enviaba apellido vacío.
-- También: LIMIT 1 en los dedupe lookups para evitar error si hay duplicados.

CREATE OR REPLACE FUNCTION create_client_quick(
  p_first_name text,
  p_last_name  text DEFAULT NULL,
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
  v_first    text := NULLIF(btrim(p_first_name), '');
  v_last     text := NULLIF(btrim(p_last_name), '');
  v_phone    text := NULLIF(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_cedula   text := NULLIF(regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g'), '');
  v_email    text := NULLIF(btrim(p_email), '');
  v_notes    text := NULLIF(btrim(p_notes), '');
  v_id       text;
BEGIN
  IF v_first IS NULL THEN
    RAISE EXCEPTION 'Nombre obligatorio';
  END IF;

  IF v_cedula IS NOT NULL THEN
    SELECT id INTO v_id FROM clients
      WHERE regexp_replace(coalesce(cedula, ''), '[^0-9]', '', 'g') = v_cedula
      LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_id FROM clients
      WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone
      LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  v_id := 'cli_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  INSERT INTO clients (id, first_name, last_name, phone, cedula, email, notes)
  VALUES (v_id, v_first, v_last, v_phone, v_cedula, v_email, v_notes);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_client_quick(text, text, text, text, text, text) TO anon, authenticated;
