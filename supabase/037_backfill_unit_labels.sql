-- ============================================================
-- 037: Backfill unit_label/unit_size en productos legacy
-- ============================================================
-- Aplicada via MCP execute_sql el 2026-06-03.
-- Razón: 144 de 155 productos activos no tenían unit_label.
-- Modelo definido por Sam: MP base SIEMPRE en métrica menor (g/ml/u)
-- porque las recetas usan cantidades pequeñas. Productos sellables = 1 u
-- (cada uno es 1 botella/lata/plato).
-- ============================================================

-- Productos sellables + plato → 1 u
UPDATE products SET unit_size = 1, unit_label = 'u'
WHERE type IN ('producto', 'plato') AND active = true
  AND (unit_label IS NULL OR unit_label = '');

-- MP líquidos → base ml
UPDATE products SET unit_size = 1, unit_label = 'ml'
WHERE type = 'materia_prima' AND active = true
  AND (unit_label IS NULL OR unit_label = '')
  AND name IN ('Aceite', 'Aceite De Oliva', 'Mayonesa', 'Mostaza',
               'Salsa Bbq', 'Salsa De Tomate', 'Salsa Soya', 'Sirope', 'Vainilla');

-- MP pesos → base g
UPDATE products SET unit_size = 1, unit_label = 'g'
WHERE type = 'materia_prima' AND active = true
  AND (unit_label IS NULL OR unit_label = '')
  AND name IN ('Carne Parrilla', 'Carne De Hamburguesa', 'Pollo Parrilla',
               'Papelon', 'Papa Congelada', 'Papas Fritas', 'Toddy');

-- MP resto → contables u
UPDATE products SET unit_size = 1, unit_label = 'u'
WHERE type = 'materia_prima' AND active = true
  AND (unit_label IS NULL OR unit_label = '');

-- Fix Carne De Hamburguesa: tenía unit_label='Kg' (mayúscula, legacy).
-- Convertir a base g multiplicando stock × 1000 y dividiendo cost / 1000.
UPDATE products
SET
  unit_label = 'g',
  unit_size = 1,
  stock_quantity = stock_quantity * 1000,
  cost_ref = cost_ref / 1000
WHERE name = 'Carne De Hamburguesa'
  AND type = 'materia_prima'
  AND unit_label = 'Kg';

-- Servicios quedan sin label (no aplica).
