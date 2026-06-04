-- ============================================================
-- 041: Numeración correlativa de facturas cantina
-- ============================================================
-- Aplicada via MCP el 2026-06-04.
--
-- Secuencia separada del complejo (por requisito fiscal venezolano).
-- Las facturas se numeran solo cuando has_factura=true.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS cantina_invoice_seq START 1;

ALTER TABLE cantina_sales
  ADD COLUMN IF NOT EXISTS invoice_number integer;

CREATE INDEX IF NOT EXISTS idx_cantina_sales_invoice_number
  ON cantina_sales(invoice_number) WHERE invoice_number IS NOT NULL;

-- RPC atomic para evitar race conditions
CREATE OR REPLACE FUNCTION assign_cantina_invoice_number(p_sale_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_next integer;
BEGIN
  SELECT invoice_number INTO v_existing FROM cantina_sales WHERE id = p_sale_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_next := nextval('cantina_invoice_seq');
  UPDATE cantina_sales SET invoice_number = v_next WHERE id = p_sale_id;
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_cantina_invoice_number(text) TO anon, authenticated;

INSERT INTO app_settings (key, value)
VALUES (
  'cantina_invoice_business',
  jsonb_build_object(
    'name', 'Futuros Sports - Cantina',
    'rif', '',
    'address', 'Polideportivo Cumbres de Curumo',
    'phone', '',
    'logo_url', NULL
  )
)
ON CONFLICT (key) DO NOTHING;
