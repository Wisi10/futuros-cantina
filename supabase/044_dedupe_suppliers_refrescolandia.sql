-- ============================================================
-- 044: Dedupe supplier Refrescolandia + constraint unique
-- ============================================================
-- Aplicada via MCP el 2026-06-09.
--
-- Bug: Yusmelly bloqueada al intentar registrar entrada de Bombita.
-- Producto existía pero no aparecía en el picker porque seleccionó
-- "Inversiones Refrescolandia" — y Bombita estaba asociada históricamente
-- al supplier "Refrescolandia" (sin "Inversiones"). Son la misma empresa.
--
-- Acción:
-- 1. Mover los 3 restocks de Inversiones Refrescolandia → Refrescolandia
-- 2. Borrar el duplicado de suppliers
-- 3. Unique index parcial sobre nombre normalizado (lower + trim) para
--    prevenir futuros dups a nivel DB
-- ============================================================

UPDATE cantina_restocks
SET supplier_id = 'sup_a7dcb8b12eef11', supplier = 'Refrescolandia'
WHERE supplier_id = 'sup_b44e069be558e8';

DELETE FROM suppliers WHERE id = 'sup_b44e069be558e8';

DROP INDEX IF EXISTS idx_suppliers_name_norm_unique;
CREATE UNIQUE INDEX idx_suppliers_name_norm_unique
  ON suppliers (lower(trim(name)))
  WHERE active = true;
