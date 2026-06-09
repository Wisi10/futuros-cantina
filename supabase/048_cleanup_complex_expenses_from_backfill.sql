-- ============================================================
-- 048: Quitar gastos del COMPLEJO que se colaron en el backfill 047
-- ============================================================
-- Aplicada via MCP el 2026-06-09.
--
-- Contexto: tras aplicar 047, Sam revisó el total ($45.9K) y pidió
-- breakdown. Detección: el bucket "Compras de inventario" (21 filas)
-- era mixto — tenía gastos del complejo (uniformes para canchas,
-- balones futsal, reflectores, herramientas, cemento, mallas F11
-- de canchas, etc.) registrados por Gabriel y Giancarlo que no son
-- staff cantina.
--
-- Sam confirmó la clasificación item por item:
--   - 6 son cantina (Refrescolandia, Kpely×2, La Jungla, Dist
--     Fernandez, Venta de contado) → SE MANTIENEN
--   - 15 son complejo → SE BORRAN de cantina_expenses
--
-- Las filas originales quedan intactas en `expenses` (compartida con
-- futuros-demo) — solo las saco de cantina_expenses.
--
-- Resultado: 901 → 886 filas, $45,900.05 → $43,488.71 ($2,411 quitados).
-- ============================================================

DELETE FROM cantina_expenses WHERE id IN (
  'cex_lgc_a6cae7bb6a201ba6cc', -- franelas staff (Giancarlo)
  'cex_lgc_85333c524fb03a3c87', -- Franelas Staff prov Utopía
  'cex_lgc_b8df444637e28458d6', -- Balones Futsal
  'cex_lgc_1265d4ae0b02322381', -- Reflector + Sunlight
  'cex_lgc_3382d3ab3d94a6e1dd', -- pega proteccion plastico
  'cex_lgc_f0cbe995e4f2b3c8bd', -- Gorras 50%
  'cex_lgc_61abbfd7c269de6023', -- Materiales y herramientas
  'cex_lgc_a63f54314163df3ddc', -- lamparas mosquitos
  'cex_lgc_f0b530badfbcc14aa9', -- Botas seguridad y poncho
  'cex_lgc_e16fd59e2b2d5f5747', -- Recarga botellón agua 20L
  'cex_lgc_480c0aa04b27d63daa', -- restante mallas
  'cex_lgc_7749112752122d3a54', -- Mallas F11
  'cex_lgc_636a298ab99df87118', -- 3kg cemento
  'cex_lgc_c17edc60006e3e66f0', -- Implementos deportivos + rodilleras
  'cex_lgc_c242c1ceff0fbf006d'  -- Dispensadores de jabón
);
