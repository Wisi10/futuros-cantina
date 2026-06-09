-- ============================================================
-- 047: cantina_expenses unificada (auto + manual) + backfill
-- ============================================================
-- Aplicada via MCP el 2026-06-09.
--
-- Contexto: Sam pidió un tab Gastos como hub único para staff.
-- Diagnóstico previo: el código auto-insertaba gastos cantina
-- (restocks pagados, pagos por pagar, wizard producto) en la tabla
-- `expenses` (compartida con futuros-demo). El GastosView de cantina
-- leía de `cantina_expenses` (que estaba vacía → Yusmelly nunca veía
-- sus gastos auto-generados ni podía registrar gastos manuales útiles).
--
-- Decisiones:
--   1) Agregar columna `source` para distinguir origen del gasto:
--      manual / auto_restock / auto_payable / auto_product / legacy
--   2) Backfill: copiar a cantina_expenses todas las filas de
--      `expenses` con categoría cantina explícita. NO borrar de
--      expenses (futuros-demo sigue leyendo de ahí para reporte global).
--   3) Categorías legacy renormalizadas a las 4 acordadas con Sam:
--      "Materia Prima / Insumos", "Nómina / Sueldos",
--      "Servicios (Luz / Agua / Internet / Gas)",
--      "Mantenimiento / Equipos / Otros".
--   4) RLS write policy permisiva (mismo patrón 036/038/046).
--
-- Resultado: 901 filas backfilleadas, ~$45.9K REF desde 2025-03-01.
-- ============================================================

ALTER TABLE cantina_expenses
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id TEXT,
  ADD COLUMN IF NOT EXISTS legacy_expense_id TEXT;

ALTER TABLE cantina_expenses DROP CONSTRAINT IF EXISTS cantina_expenses_source_chk;
ALTER TABLE cantina_expenses ADD CONSTRAINT cantina_expenses_source_chk
  CHECK (source IN ('manual','auto_restock','auto_payable','auto_product','legacy'));

INSERT INTO cantina_expenses (
  id, expense_date, category, description, amount_ref, amount_bs, amount_usd,
  payment_method, reference, exchange_rate_bs, created_by, created_at,
  source, legacy_expense_id
)
SELECT
  'cex_lgc_' || substr(md5(id), 1, 18),
  expense_date,
  CASE
    WHEN category ILIKE 'Insumos cantina%' THEN 'Materia Prima / Insumos'
    WHEN category = 'Materia Prima' THEN 'Materia Prima / Insumos'
    WHEN category = 'Compras de inventario' THEN 'Materia Prima / Insumos'
    WHEN category = 'Hidratación' THEN 'Materia Prima / Insumos'
    WHEN category = 'Nómina cantina' THEN 'Nómina / Sueldos'
    WHEN category = 'Mantenimiento cantina' THEN 'Mantenimiento / Equipos / Otros'
    ELSE category
  END,
  COALESCE(NULLIF(btrim(name), ''),
           NULLIF(btrim(notes), ''),
           NULLIF(btrim(provider), ''),
           'Gasto sin descripción'),
  COALESCE(amount_usd, 0),
  amount_bs,
  amount_usd,
  COALESCE(payment_method, 'efectivo'),
  reference,
  exchange_rate,
  COALESCE(created_by, 'Sistema (legacy)'),
  COALESCE(created_at, (expense_date::timestamp)::timestamptz),
  'legacy',
  id
FROM expenses
WHERE category ILIKE '%cantina%'
   OR category IN ('Materia Prima','Compras de inventario','Hidratación')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_cantina_expenses_date ON cantina_expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_cantina_expenses_source ON cantina_expenses (source);
CREATE INDEX IF NOT EXISTS idx_cantina_expenses_legacy_ref ON cantina_expenses (legacy_expense_id) WHERE legacy_expense_id IS NOT NULL;

ALTER TABLE cantina_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cantina_expenses_write ON cantina_expenses;
CREATE POLICY cantina_expenses_write ON cantina_expenses
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON cantina_expenses TO anon, authenticated;
