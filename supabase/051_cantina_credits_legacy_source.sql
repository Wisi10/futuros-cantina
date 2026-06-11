-- Migration 051: allow manual/legacy debts in cantina_credits
-- Aplicada via PAT 2026-06-11. Este archivo es audit trail.
--
-- Razón: clientes históricos sin tracking de productos, solo monto.
-- Staff podrá ingresar "deuda histórica" desde el perfil del cliente
-- sin tocar la función de crédito por venta (que sí trackea productos).
--
-- Cambios:
-- 1. sale_id pasa a nullable (legacy debts no tienen venta originaria).
-- 2. Nueva columna source: 'sale' (default, créditos normales) o 'legacy' (deuda manual).
-- 3. Rows existentes (18) reciben source='sale' por DEFAULT.
-- 4. Index en source para filtros rápidos.

ALTER TABLE cantina_credits ALTER COLUMN sale_id DROP NOT NULL;

ALTER TABLE cantina_credits
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sale'
  CHECK (source IN ('sale', 'legacy'));

CREATE INDEX IF NOT EXISTS idx_cantina_credits_source ON cantina_credits(source);
