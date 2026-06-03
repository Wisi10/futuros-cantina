-- ============================================================
-- 035: Product taxonomy (type) + packs (pack_size/label) + suppliers normalizados
-- ============================================================
-- Aplicada via MCP apply_migration el 2026-06-03.
-- Backfill resultados:
--   - 105 producto
--   - 38 materia_prima
--   - 10 servicio (Hora Cancha, Mesa, Balon, Anfitrion, etc)
--   - 1 plato (Racion De Nuggets + Papas)
--   - 0 bebida_preparada (Hamburguesa/Café etc tenian has_recipe=false → reclasificar manual)
-- Suppliers: 13 backfilleados desde cantina_restocks.supplier (texto libre).
-- 122 restocks linkeados con supplier_id FK, 0 huérfanos.
-- ============================================================

-- ---- 1) products.type ----
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS type text;

UPDATE products SET type = CASE
  WHEN is_cantina = false AND category IN ('Materia Prima', 'Insumos') THEN 'materia_prima'
  WHEN category IN ('Servicio', 'Alquiler', 'Mobiliario', 'Cancha') THEN 'servicio'
  WHEN has_recipe = true AND category = 'Bebida' THEN 'bebida_preparada'
  WHEN has_recipe = true THEN 'plato'
  ELSE 'producto'
END
WHERE type IS NULL;

ALTER TABLE products
  ALTER COLUMN type SET NOT NULL,
  ADD CONSTRAINT products_type_check
    CHECK (type IN ('producto', 'plato', 'bebida_preparada', 'materia_prima', 'servicio'));

CREATE INDEX IF NOT EXISTS idx_products_type ON products(type) WHERE active = true;

-- ---- 2) products.pack_size + pack_label ----
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pack_size numeric,
  ADD COLUMN IF NOT EXISTS pack_label text;

COMMENT ON COLUMN products.pack_size IS 'Cuantas unidades trae 1 pack de compra. NULL si no se compra en pack.';
COMMENT ON COLUMN products.pack_label IS 'Nombre del pack. Ej: caja, bulto, pallet.';

-- ---- 3) Tabla suppliers ----
CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY DEFAULT 'sup_' || substr(md5(random()::text || clock_timestamp()::text), 1, 14),
  name text NOT NULL,
  default_payment_method text,
  contact_phone text,
  notes text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_name_unique
  ON suppliers (LOWER(TRIM(name))) WHERE active = true;

INSERT INTO suppliers (name)
SELECT DISTINCT TRIM(supplier)
FROM cantina_restocks
WHERE supplier IS NOT NULL AND TRIM(supplier) <> ''
ON CONFLICT DO NOTHING;

-- ---- 4) cantina_restocks.supplier_id FK ----
ALTER TABLE cantina_restocks
  ADD COLUMN IF NOT EXISTS supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL;

UPDATE cantina_restocks r
SET supplier_id = s.id
FROM suppliers s
WHERE r.supplier_id IS NULL
  AND r.supplier IS NOT NULL
  AND LOWER(TRIM(r.supplier)) = LOWER(TRIM(s.name));

CREATE INDEX IF NOT EXISTS idx_cantina_restocks_supplier_id ON cantina_restocks(supplier_id);

-- ---- 5) RLS ----
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suppliers_all ON suppliers;
CREATE POLICY suppliers_all ON suppliers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO anon, authenticated;
