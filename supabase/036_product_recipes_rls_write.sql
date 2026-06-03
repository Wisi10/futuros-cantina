-- ============================================================
-- 036: RLS policy permisiva en product_recipes para INSERT/UPDATE/DELETE
-- ============================================================
-- Aplicada via MCP apply_migration el 2026-06-03.
-- Bug: wizard Crear Producto (Fase 3) fallaba al insertar recetas con
-- "new row violates row-level security policy". La tabla solo tenía policy
-- product_recipes_read. Faltaba write policy.
-- ============================================================

DROP POLICY IF EXISTS product_recipes_write ON product_recipes;
CREATE POLICY product_recipes_write ON product_recipes
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON product_recipes TO anon, authenticated;
