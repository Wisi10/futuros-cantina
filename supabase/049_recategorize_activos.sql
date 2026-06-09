-- ============================================================
-- 049: Categoría "Activos" para equipos cantina
-- ============================================================
-- Aplicada via MCP el 2026-06-09.
--
-- Sam pidió separar activos fijos de consumibles. 5 filas del
-- histórico (todas via "Import (Claude)" desde planilla de gastos)
-- son equipos no insumos. Movidos a categoría "Activos":
--   - Vitrina Vertical TV 32" ($1,390.77) 2025-09-20
--   - TV + Router WiFi + Set Cuchillos + Corneta ($742.38) 2025-03-15
--   - Freezer ($657.04) 2025-04-04
--   - Xiaomi Redmi Pad 2 11" tablet POS ($276.18) 2025-10-01
--   - Air Fryer Aiwa 3,5L ($99.44) 2025-11-14
-- Total movido: $3,165.81
--
-- También se agrega "Activos" a EXPENSE_CATEGORIES en lib/utils.js
-- para que aparezca en el dropdown del form manual.
-- ============================================================

UPDATE cantina_expenses
SET category = 'Activos'
WHERE id IN (
  'cex_lgc_c2ffaf0a104091965c',
  'cex_lgc_d92607446847826e85',
  'cex_lgc_d7ff636722a0d8230c',
  'cex_lgc_7eec6173f8709565a2',
  'cex_lgc_fa9ff730549f472838'
);
