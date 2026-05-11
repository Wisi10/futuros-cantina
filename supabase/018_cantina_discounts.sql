-- Migration 018 — Descuentos cantina
-- Extiende la tabla shared `discounts` con flag is_cantina (mismo patron que products.is_cantina).
-- Asi reusamos la tabla existente sin duplicarla.
-- Los descuentos cantina son nominales por cliente; la columna happy_hour_* queda en NULL.

ALTER TABLE discounts
ADD COLUMN IF NOT EXISTS is_cantina boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_discounts_cantina ON discounts(is_cantina) WHERE is_cantina = true;

-- Seed presets: 20% y 30%
INSERT INTO discounts (name, percentage, is_active, is_happy_hour, sort_order, is_cantina)
VALUES
  ('Descuento 20%', 20.00, true, false, 10, true),
  ('Descuento 30%', 30.00, true, false, 11, true)
ON CONFLICT DO NOTHING;
