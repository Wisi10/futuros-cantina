-- 023_products_unit_size.sql
-- Agregar campos opcionales de tamaño físico a products. Útil para materia
-- prima donde la "unidad" puede tener peso/volumen (ej: 1 unidad de carne
-- molida = 1 kg, 1 unidad de leche = 1 L).
--
-- unit_label: 'kg', 'g', 'l', 'ml', 'u' (default) u otra unidad.
-- unit_size:  cuánto de esa unidad por cada stock_quantity (ej: 1 kg, 500 g).
--
-- NULL = sin info (comportamiento actual). El sistema sigue funcionando igual.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit_label text,
  ADD COLUMN IF NOT EXISTS unit_size numeric;

COMMENT ON COLUMN products.unit_label IS 'Etiqueta de unidad física (kg, g, l, ml, u, etc). NULL = sin info.';
COMMENT ON COLUMN products.unit_size  IS 'Cantidad de unit_label por cada unidad de stock_quantity. NULL = sin info.';
