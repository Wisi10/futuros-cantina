-- ============================================================
-- 043: cantina_sales.client_cedula para facturas
-- ============================================================
-- Aplicada via MCP el 2026-06-04.
-- Capturada en SuccessScreen cuando staff genera factura y el cliente
-- no tenía cédula registrada previamente.
-- ============================================================

ALTER TABLE cantina_sales
  ADD COLUMN IF NOT EXISTS client_cedula text;

COMMENT ON COLUMN cantina_sales.client_cedula IS 'Cédula/RIF del cliente para fines fiscales. Capturada al generar factura.';
