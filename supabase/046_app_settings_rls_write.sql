-- 046: RLS write policy en app_settings (aplicada via MCP 2026-06-09)
-- Bug: error "row violates RLS" al guardar umbral stock desde Config.
DROP POLICY IF EXISTS app_settings_write ON app_settings;
CREATE POLICY app_settings_write ON app_settings
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON app_settings TO anon, authenticated;
