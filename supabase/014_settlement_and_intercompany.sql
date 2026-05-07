-- 014_settlement_and_intercompany.sql
-- Adds intercompany transfer tracking + settlement columns on events.
-- Order matters: create intercompany_transfers first so events FK can reference it.

-- 1. intercompany_transfers
CREATE TABLE public.intercompany_transfers (
  id              TEXT PRIMARY KEY,
  amount_ref      NUMERIC NOT NULL,
  amount_bs       NUMERIC,
  exchange_rate   NUMERIC,
  payment_method  TEXT,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.intercompany_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access"
  ON public.intercompany_transfers
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "anon_intercompany_transfers"
  ON public.intercompany_transfers
  FOR ALL TO anon
  USING (true) WITH CHECK (true);

-- 2. events: settlement tracking columns (FK to intercompany_transfers)
ALTER TABLE public.events
  ADD COLUMN is_settled    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN settled_at    TIMESTAMPTZ NULL,
  ADD COLUMN settlement_id TEXT        NULL
    REFERENCES public.intercompany_transfers(id) ON DELETE RESTRICT;

-- 3. RLS: anon SELECT-only on events / event_items
CREATE POLICY "anon_events_read"
  ON public.events
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon_event_items_read"
  ON public.event_items
  FOR SELECT TO anon
  USING (true);
