-- 028_cantina_sales_iva_igtf.sql
-- IVA + IGTF en ventas de cantina. Tasas editables desde Config.

ALTER TABLE cantina_sales
  ADD COLUMN IF NOT EXISTS iva_amount_ref numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igtf_amount_ref numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_factura boolean NOT NULL DEFAULT false;

INSERT INTO app_settings (key, value)
VALUES
  ('cantina_iva_rate_pct',  '{"value": 16}'::jsonb),
  ('cantina_igtf_rate_pct', '{"value": 3}'::jsonb)
ON CONFLICT (key) DO NOTHING;
