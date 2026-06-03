-- ============================================================
-- 038: RLS write policy en expenses
-- ============================================================
-- Aplicada via MCP el 2026-06-03.
-- Bug: RestockForm y wizard fallaban al crear el expense auto.
-- Mismo pattern de migration 036 (product_recipes).
-- ============================================================

DROP POLICY IF EXISTS expenses_write ON expenses;
CREATE POLICY expenses_write ON expenses
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO anon, authenticated;
