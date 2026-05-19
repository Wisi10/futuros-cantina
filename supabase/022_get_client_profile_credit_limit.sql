-- 022_get_client_profile_credit_limit.sql
-- Agregar credit_limit_ref al RETURN de get_client_profile para que
-- el ClientModal (perfil) pueda mostrar/editar el tope.

CREATE OR REPLACE FUNCTION public.get_client_profile(client_id_param text)
RETURNS TABLE(
  id text, full_name text, cedula text,
  pending_credits_count integer, pending_credits_ref numeric,
  loyalty_points integer,
  cantina_discount_id uuid, cantina_discount_name text, cantina_discount_pct numeric,
  credit_limit_ref numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS full_name,
    c.cedula,
    COALESCE((SELECT COUNT(*)::INTEGER FROM cantina_credits cc WHERE cc.client_id = c.id AND cc.status IN ('pending', 'partial')), 0) AS pending_credits_count,
    COALESCE((SELECT SUM(cc.original_amount_ref - COALESCE(cc.paid_amount_ref, 0)) FROM cantina_credits cc WHERE cc.client_id = c.id AND cc.status IN ('pending', 'partial')), 0) AS pending_credits_ref,
    COALESCE((SELECT points_balance FROM loyalty_balances lb WHERE lb.client_id = c.id), 0) AS loyalty_points,
    c.cantina_discount_id,
    (SELECT d.name FROM discounts d WHERE d.id = c.cantina_discount_id AND d.is_active = true AND d.is_cantina = true) AS cantina_discount_name,
    (SELECT d.percentage FROM discounts d WHERE d.id = c.cantina_discount_id AND d.is_active = true AND d.is_cantina = true) AS cantina_discount_pct,
    COALESCE(c.credit_limit_ref, 50) AS credit_limit_ref
  FROM clients c
  WHERE c.id = client_id_param;
$function$;
