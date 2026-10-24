-- 055_cantina_daily_closings.sql
-- Cierre diario reportado por el gerente (impresion del POS enviada por
-- WhatsApp). Se compara con cantina_sales en Reportes. Datos may-oct 2026
-- cargados desde el export del chat "Adm - Cantina".
CREATE TABLE IF NOT EXISTS public.cantina_daily_closings (
  closing_date date PRIMARY KEY,
  total numeric NOT NULL,
  debito numeric,
  pago_movil numeric,
  efectivo numeric,
  source text NOT NULL DEFAULT 'whatsapp',
  raw_text text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cantina_daily_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cantina_daily_closings_auth ON public.cantina_daily_closings;
CREATE POLICY cantina_daily_closings_auth ON public.cantina_daily_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.cantina_daily_closings FROM anon;
