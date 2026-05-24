-- 029_loyalty_catalog_3pct.sql
-- Reduce el catálogo de canjeables a 3 productos finales con generosidad 3%
-- (techo defendible para volumen de cantina, donde clientes gastan cientos/mes).
-- Anteriormente 39 productos a 10% generosidad — devorando márgenes.
--
-- Fórmula: cost_points = price_ref * 1000 / 3 (≈ × 333), redondeado a 50.
-- Helados 2  $2 → 650 pts (gastas $65 reales para canjearlo)
-- Hamburguesa $5 → 1650 pts (gastas $165)
-- Parrilla Mixta $7 → 2350 pts (gastas $235)
--
-- Los otros 36 quedan is_redeemable=false (no se borran, preserva historial
-- en loyalty_redemptions). Si en el futuro se quiere reactivar alguno,
-- solo es UPDATE puntual.

UPDATE products SET is_redeemable = false WHERE is_redeemable = true;

UPDATE products SET is_redeemable = true, redemption_cost_points = 650
WHERE id = '6f02cd30-52bd-4264-b32a-3521030ebe0f';  -- Helados 2

UPDATE products SET is_redeemable = true, redemption_cost_points = 1650
WHERE id = '810d1b1bafa04d96a7e6';  -- Hamburguesa

UPDATE products SET is_redeemable = true, redemption_cost_points = 2350
WHERE id = '48501a2c-9cc2-4bae-9e25-a4b409358be7';  -- Parrilla Mixta
