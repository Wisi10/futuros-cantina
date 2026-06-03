-- ============================================================
-- 039: Perfil doble (weight_per_unit + weight_unit) + cleanup legacy
-- ============================================================
-- Aplicada via MCP el 2026-06-03.
--
-- Concepto perfil doble: MP contables que también se usan por peso/vol
-- en recetas (Tomate, Naranjas, Cebolla, Pimentón, Lechuga, etc).
-- - unit_label = cómo se cuenta el stock (siempre 'u' para doble)
-- - weight_per_unit = cuánto pesa 1 unidad (ej. 150 g por tomate)
-- - weight_unit = 'g' o 'ml'
--
-- En recetas: cuando ingrediente tiene weight_per_unit, el dropdown
-- muestra 2 opciones (u + g/ml). Stock se descuenta convertido.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_per_unit numeric,
  ADD COLUMN IF NOT EXISTS weight_unit text;

ALTER TABLE products
  ADD CONSTRAINT products_weight_unit_check
    CHECK (weight_unit IS NULL OR weight_unit IN ('g', 'ml'));

COMMENT ON COLUMN products.weight_per_unit IS 'Para MP contables con peso/vol: cuánto pesa/mide 1 unidad. NULL si no aplica.';
COMMENT ON COLUMN products.weight_unit IS 'Métrica del weight_per_unit (g o ml). NULL si no aplica.';

-- ---- Cleanup legacy ----

-- Fix Carne Parrilla: unit_label 'G' (mayúscula) → 'g'
UPDATE products SET unit_label = 'g'
WHERE name = 'Carne Parrilla' AND unit_label = 'G';

-- Soft-delete duplicados de Papelón. Canónico: 'Papelón Mp'
UPDATE products SET active = false
WHERE name IN ('Papelon', 'Papelón Mt') AND type = 'materia_prima';

-- Tomate: era base=g stock=1000 confuso (test data de hoy). Migrar a doble.
UPDATE products
SET
  unit_label = 'u',
  unit_size = 1,
  stock_quantity = 0,
  cost_ref = 0,
  weight_per_unit = 150,
  weight_unit = 'g'
WHERE name = 'Tomate' AND type = 'materia_prima';

-- Naranjas: ya en base=u, solo agregar weight_per_unit
UPDATE products
SET
  weight_per_unit = 200,
  weight_unit = 'g'
WHERE name = 'Naranjas' AND type = 'materia_prima';
