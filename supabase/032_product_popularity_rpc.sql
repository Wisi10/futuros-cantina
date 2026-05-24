-- 032_product_popularity_rpc.sql
-- RPC que devuelve la cantidad total vendida por producto en los últimos N
-- días. Usado en POS ProductGrid para ordenar productos por más-pedidos
-- dentro de cada categoría. Excluye ventas anuladas.

CREATE OR REPLACE FUNCTION get_product_popularity(p_days integer DEFAULT 30)
RETURNS TABLE(product_id text, total_qty bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (item->>'product_id') AS product_id,
    SUM((item->>'qty')::numeric)::bigint AS total_qty
  FROM cantina_sales s
  CROSS JOIN LATERAL jsonb_array_elements(s.items) item
  WHERE s.created_at >= NOW() - (p_days || ' days')::interval
    AND s.voided_at IS NULL
    AND (item->>'product_id') IS NOT NULL
  GROUP BY (item->>'product_id')
  ORDER BY total_qty DESC;
$$;

GRANT EXECUTE ON FUNCTION get_product_popularity(integer) TO anon, authenticated;
