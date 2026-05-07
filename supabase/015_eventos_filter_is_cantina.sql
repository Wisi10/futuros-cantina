-- 015_eventos_filter_is_cantina.sql
-- Restrict intercompany debt aggregations to products marked is_cantina = true.
-- Cantina supplies only food/drink; chairs, fields, hosts etc. do not count as
-- intercompany debt the complejo owes the cantina.
--
-- Modified: recalc_event_total_owed, get_events_with_combo_totals
-- Unchanged: get_intercompany_summary (reads stored total_owed_ref),
--            register_event_payment (no item aggregation)

CREATE OR REPLACE FUNCTION public.recalc_event_total_owed(p_event_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(ei.quantity * COALESCE(p.cost_ref, 0)), 0)
  INTO v_total
  FROM event_items ei
  LEFT JOIN products p ON p.id = ei.product_id
  WHERE ei.event_id = p_event_id
    AND p.is_cantina = true;

  UPDATE events SET total_owed_ref = v_total WHERE id = p_event_id;
  RETURN v_total;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_events_with_combo_totals(p_month_start date)
 RETURNS TABLE(event_id text, event_date date, client_id text, client_name text, package_id text, package_name text, booking_id text, combo_total_ref numeric, combo_paid_ref numeric, combo_payment_status text, intercompany_owed_ref numeric, intercompany_paid_ref numeric, intercompany_status text, is_settled boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH month_range AS (
    SELECT p_month_start AS m_start, (p_month_start + interval '1 month')::date AS m_end
  ),
  events_in_month AS (
    SELECT e.* FROM events e, month_range mr
    WHERE e.event_date >= mr.m_start AND e.event_date < mr.m_end
  ),
  combo_totals AS (
    SELECT ei.event_id, SUM(ei.quantity * COALESCE(ei.price_ref, 0)) AS total
    FROM event_items ei
    JOIN events_in_month e ON e.id = ei.event_id
    GROUP BY ei.event_id
  ),
  intercompany_owed AS (
    SELECT ei.event_id, SUM(ei.quantity * COALESCE(p.cost_ref, 0)) AS owed
    FROM event_items ei
    LEFT JOIN products p ON p.id = ei.product_id
    JOIN events_in_month e ON e.id = ei.event_id
    WHERE p.is_cantina = true
    GROUP BY ei.event_id
  ),
  combo_paid AS (
    SELECT b.id AS booking_id,
           SUM(CASE WHEN py.method = 'refund' THEN -COALESCE(py.amount_eur, 0)
                    ELSE COALESCE(py.amount_eur, 0) END) AS paid
    FROM bookings b
    JOIN payments py ON py.booking_id = b.id
    JOIN events_in_month e ON e.booking_id = b.id
    GROUP BY b.id
  ),
  intercompany_paid AS (
    SELECT ep.event_id, SUM(ep.amount_ref) AS paid
    FROM event_payments ep
    JOIN events_in_month e ON e.id = ep.event_id
    GROUP BY ep.event_id
  )
  SELECT
    e.id AS event_id,
    e.event_date,
    e.client_id,
    COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), '(sin cliente)') AS client_name,
    e.package_id,
    bp.name AS package_name,
    e.booking_id,
    COALESCE(ct.total, 0)::numeric AS combo_total_ref,
    COALESCE(cp.paid, 0)::numeric AS combo_paid_ref,
    CASE
      WHEN COALESCE(ct.total, 0) <= 0 THEN 'pending'
      WHEN COALESCE(cp.paid, 0) >= COALESCE(ct.total, 0) - 0.01 THEN 'paid'
      WHEN COALESCE(cp.paid, 0) > 0 THEN 'partial'
      ELSE 'pending'
    END AS combo_payment_status,
    COALESCE(io.owed, 0)::numeric AS intercompany_owed_ref,
    COALESCE(ip.paid, 0)::numeric AS intercompany_paid_ref,
    CASE
      WHEN e.is_settled THEN 'settled'
      WHEN COALESCE(ip.paid, 0) > 0 THEN 'partial'
      ELSE 'pending'
    END AS intercompany_status,
    e.is_settled
  FROM events_in_month e
  LEFT JOIN clients c ON c.id = e.client_id
  LEFT JOIN birthday_packages bp ON bp.id = e.package_id
  LEFT JOIN combo_totals ct ON ct.event_id = e.id
  LEFT JOIN intercompany_owed io ON io.event_id = e.id
  LEFT JOIN combo_paid cp ON cp.booking_id = e.booking_id
  LEFT JOIN intercompany_paid ip ON ip.event_id = e.id
  ORDER BY e.event_date DESC;
$function$;
