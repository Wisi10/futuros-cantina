-- 033_stock_quantity_numeric.sql
-- Necesario para BUG 2 audit (unit conversion en recetas):
-- si MP está en kg y receta pide gramos, el stock decrementado puede ser
-- fraccionario (10kg - 0.2kg = 9.8kg). Integer no aguanta.
--
-- recompute_product_mac trigger ya usa numeric internamente; no rompe.

ALTER TABLE products
  ALTER COLUMN stock_quantity TYPE numeric USING stock_quantity::numeric;

ALTER TABLE stock_movements
  ALTER COLUMN quantity TYPE numeric USING quantity::numeric;
