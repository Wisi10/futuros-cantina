-- 021_credit_limit_clients.sql
-- Agregar credit_limit_ref a la tabla compartida `clients` para que cantina
-- pueda imponer un tope de crédito (cantina_credits) por cliente.
--
-- Default $50 (cualquier cliente nuevo). Owner/admin puede subir a $100
-- a clientes especiales (ej staff FVFC) desde el perfil del cliente.
--
-- NOTA: esto NO afecta a `payments` del complejo (futuros-demo). Es
-- solo para créditos de cantina.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS credit_limit_ref numeric NOT NULL DEFAULT 50;

COMMENT ON COLUMN clients.credit_limit_ref IS
  'Tope máximo (USD; columna legacy "_ref") de crédito acumulado en cantina_credits. Default 50. Editable por admin/owner.';
