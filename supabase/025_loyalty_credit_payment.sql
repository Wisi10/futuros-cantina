-- 025_loyalty_credit_payment.sql
-- Bug #10: el cliente recibía puntos cuando se le abría una venta a crédito,
-- aunque no hubiera pagado. Lo correcto es que los puntos se acumulen
-- cuando paga (cantina_credit_payments). Para ventas pagadas directo
-- el comportamiento no cambia.
--
-- Cambios:
-- 1. loyalty_transactions: nueva columna related_credit_payment_id para
--    dedup por pago de crédito.
-- 2. award_loyalty_for_credit_payment(p_payment_id): RPC SECURITY DEFINER
--    que premia puntos proporcionales al monto del pago de crédito.

ALTER TABLE loyalty_transactions
  ADD COLUMN IF NOT EXISTS related_credit_payment_id text;

CREATE OR REPLACE FUNCTION public.award_loyalty_for_credit_payment(p_payment_id text)
RETURNS TABLE(success boolean, points_awarded integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment RECORD;
  v_credit RECORD;
  v_points INTEGER;
  v_transaction_id TEXT;
BEGIN
  SELECT id, credit_id, amount_ref INTO v_payment
  FROM cantina_credit_payments WHERE id = p_payment_id;

  IF v_payment IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Payment not found'::TEXT;
    RETURN;
  END IF;

  SELECT id, client_id INTO v_credit
  FROM cantina_credits WHERE id = v_payment.credit_id;

  IF v_credit IS NULL OR v_credit.client_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Credit has no registered client'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM loyalty_transactions
    WHERE related_credit_payment_id = p_payment_id
      AND transaction_type = 'gain'
  ) THEN
    RETURN QUERY SELECT FALSE, 0, 'Points already awarded for this payment'::TEXT;
    RETURN;
  END IF;

  v_points := FLOOR(COALESCE(v_payment.amount_ref, 0) * 10);
  IF v_points <= 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'No points to award'::TEXT;
    RETURN;
  END IF;

  v_transaction_id := 'lty_' || gen_random_uuid()::TEXT;
  INSERT INTO loyalty_transactions
    (id, client_id, transaction_type, points_delta, related_credit_payment_id, notes)
  VALUES
    (v_transaction_id, v_credit.client_id, 'gain', v_points, p_payment_id,
     'Pago de crédito ' || v_payment.credit_id);

  INSERT INTO loyalty_balances (client_id, points_balance, last_activity_at, updated_at)
  VALUES (v_credit.client_id, v_points, NOW(), NOW())
  ON CONFLICT (client_id) DO UPDATE
    SET points_balance = loyalty_balances.points_balance + v_points,
        last_activity_at = NOW(),
        updated_at = NOW();

  RETURN QUERY SELECT TRUE, v_points, 'Points awarded for credit payment'::TEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.award_loyalty_for_credit_payment(text) TO anon, authenticated;
