-- ============================================================
-- 040: Normalizar items jsonb + stock_movements legacy de Carne
-- ============================================================
-- Aplicada via MCP el 2026-06-03.
--
-- Contexto: migration 037 fixeó products.unit_label de 'Kg'/'G' a 'g'.
-- Pero los cantina_restocks.items y stock_movements pre-migration
-- quedaron con qty en kg y cost en $/kg, generando inconsistencia
-- visual en el ProductDetailModal (donde el display multiplica × 1000
-- el cost para mostrar $/kg).
--
-- 12 items + 12 movimientos en stock_movements actualizados:
-- - Carne Parrilla (9b735f0b-089e-42fa-8aba-25edbd4d64b8): 6 entradas
-- - Carne De Hamburguesa (663e3deb-59f7-4fa9-9e98-84ff1ec74c92): 6 entradas
--
-- Heurística: qty < 200 AND cost_per_unit > 0.5. Una entrada g real
-- tendría qty >= 1000 o cost minúsculo.
-- ============================================================

-- ---- 1) cantina_restocks.items ----
UPDATE cantina_restocks r
SET items = (
  SELECT jsonb_agg(fixed_item ORDER BY ord)
  FROM (
    SELECT
      CASE
        WHEN (item->>'product_id') IN (
              '9b735f0b-089e-42fa-8aba-25edbd4d64b8',
              '663e3deb-59f7-4fa9-9e98-84ff1ec74c92'
            )
          AND (item->>'qty')::numeric < 200
          AND (item->>'cost_per_unit_ref')::numeric > 0.5
        THEN
          jsonb_set(
            jsonb_set(
              item,
              '{qty}',
              to_jsonb(((item->>'qty')::numeric * 1000))
            ),
            '{cost_per_unit_ref}',
            to_jsonb(((item->>'cost_per_unit_ref')::numeric / 1000))
          )
        ELSE item
      END as fixed_item,
      ord
    FROM jsonb_array_elements(r.items) WITH ORDINALITY AS t(item, ord)
  ) sub
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(r.items) item
  WHERE (item->>'product_id') IN (
          '9b735f0b-089e-42fa-8aba-25edbd4d64b8',
          '663e3deb-59f7-4fa9-9e98-84ff1ec74c92'
        )
    AND (item->>'qty')::numeric < 200
    AND (item->>'cost_per_unit_ref')::numeric > 0.5
);

-- ---- 2) stock_movements ----
UPDATE stock_movements
SET
  quantity = quantity * 1000,
  cost_ref = cost_ref / 1000
WHERE product_id IN (
        '9b735f0b-089e-42fa-8aba-25edbd4d64b8',
        '663e3deb-59f7-4fa9-9e98-84ff1ec74c92'
      )
  AND movement_type = 'restock'
  AND quantity < 200
  AND cost_ref > 0.5;
