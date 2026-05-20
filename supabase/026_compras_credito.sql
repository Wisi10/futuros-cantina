-- 026_compras_credito.sql
-- Compras (restocks) a crédito: estado de pago, due date, pagos parciales.
-- Mirror del pattern existente cantina_credits + cantina_credit_payments
-- pero del lado proveedor (cantina debe a supplier en vez de cliente debe a cantina).
--
-- Decisiones de diseño (ver conversacion):
-- 1. cost_ref se locka al restock time (trigger 017 recompute_product_mac).
--    Fluctuacion cambiaria al pagar despues es gasto financiero, no costo del producto.
-- 2. Deuda fijada en REF/USD. Cada pago captura su exchange_rate_bs del día (editable).
-- 3. Restocks historicos quedan como 'paid' automaticamente (DEFAULT 'paid').
-- 4. Pagos parciales permitidos: status va pending → partial → paid segun paid_amount_ref.

ALTER TABLE cantina_restocks
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS paid_amount_ref NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- CHECK constraint en payment_status (pending | partial | paid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cantina_restocks_payment_status_check'
  ) THEN
    ALTER TABLE cantina_restocks
      ADD CONSTRAINT cantina_restocks_payment_status_check
      CHECK (payment_status IN ('pending', 'partial', 'paid'));
  END IF;
END$$;

-- Tabla de pagos contra restocks
CREATE TABLE IF NOT EXISTS cantina_restock_payments (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  restock_id TEXT NOT NULL REFERENCES cantina_restocks(id) ON DELETE CASCADE,
  amount_ref NUMERIC NOT NULL CHECK (amount_ref > 0),
  amount_bs NUMERIC,
  payment_method TEXT NOT NULL,
  reference TEXT,
  exchange_rate_bs NUMERIC,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para lookups por restock_id
CREATE INDEX IF NOT EXISTS idx_cantina_restock_payments_restock
  ON cantina_restock_payments(restock_id);

-- Index para listar pendientes en sub-tab "Por Pagar"
CREATE INDEX IF NOT EXISTS idx_cantina_restocks_payment_status
  ON cantina_restocks(payment_status)
  WHERE payment_status IN ('pending', 'partial');

-- RLS: misma policy que el resto de tablas cantina (anon puede leer/escribir)
ALTER TABLE cantina_restock_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cantina_restock_payments' AND policyname = 'restock_payments_all'
  ) THEN
    CREATE POLICY restock_payments_all ON cantina_restock_payments
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END$$;

-- Backfill: marcar paid_amount_ref = total_cost_ref para restocks historicos
-- (que quedan como 'paid' por el DEFAULT).
UPDATE cantina_restocks
SET paid_amount_ref = COALESCE(total_cost_ref, 0)
WHERE payment_status = 'paid' AND paid_amount_ref = 0;
