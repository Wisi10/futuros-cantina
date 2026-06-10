-- ============================================================
-- 050: expense_type (fijo/variable) en cantina_expenses
-- ============================================================
-- Aplicada via MCP el 2026-06-09.
--
-- Contexto: Sam pidió que el tab Gastos de cantina tenga las mismas
-- capabilities y layout que el de futuros-demo. Demo separa por
-- expense_type ('fijo' vs 'variable') en KPI cards, filtro de tipo y
-- distribución. Agregamos la columna acá.
--
-- Backfill heurístico:
--   Nómina / Sueldos      → fijo  (sueldo mensual)
--   Servicios (...)       → fijo  (luz/agua/internet recurrentes)
--   Resto                 → variable
-- Yusmelly puede sobrescribir desde el form al crear/editar.
--
-- Resultado: 74 fijos ($11K), 812 variables ($32K).
-- ============================================================

ALTER TABLE cantina_expenses
  ADD COLUMN IF NOT EXISTS expense_type TEXT NOT NULL DEFAULT 'variable';

ALTER TABLE cantina_expenses DROP CONSTRAINT IF EXISTS cantina_expenses_type_chk;
ALTER TABLE cantina_expenses ADD CONSTRAINT cantina_expenses_type_chk
  CHECK (expense_type IN ('fijo','variable'));

UPDATE cantina_expenses
SET expense_type = CASE
  WHEN category IN ('Nómina / Sueldos','Servicios (Luz / Agua / Internet / Gas)') THEN 'fijo'
  ELSE 'variable'
END;

CREATE INDEX IF NOT EXISTS idx_cantina_expenses_type ON cantina_expenses (expense_type);
