-- Migration 017 — MAC (Moving Average Cost) tracking via stock_movements trigger
-- Cada vez que se inserta un stock_movements con movement_type='restock',
-- recalcula products.cost_ref usando la formula de promedio ponderado movil:
--   new_mac = (old_stock * old_cost + qty * purchase_cost) / (old_stock + qty)
--
-- Antes de este trigger, RestockForm sobreescribia cost_ref con el ultimo precio,
-- lo que rompia el tracking de margen real cuando los precios de materia prima
-- fluctuaban. Ahora el trigger es la unica fuente de verdad para cost_ref.
--
-- Nota: el cliente (RestockForm.jsx) debe dejar de actualizar cost_ref manualmente
-- en el UPDATE de products. Solo actualiza stock_quantity.

CREATE OR REPLACE FUNCTION recompute_product_mac()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_stock numeric;
  v_old_cost numeric;
  v_new_qty numeric;
  v_new_cost numeric;
  v_new_mac numeric;
BEGIN
  IF NEW.movement_type <> 'restock' THEN
    RETURN NEW;
  END IF;

  v_new_qty := COALESCE(NEW.quantity, 0);
  v_new_cost := COALESCE(NEW.cost_ref, 0);

  IF v_new_qty <= 0 OR v_new_cost < 0 THEN
    RETURN NEW;
  END IF;

  SELECT stock_quantity, cost_ref
    INTO v_old_stock, v_old_cost
  FROM products
  WHERE id = NEW.product_id;

  v_old_stock := COALESCE(v_old_stock, 0);
  v_old_cost := COALESCE(v_old_cost, 0);

  IF (v_old_stock + v_new_qty) > 0 THEN
    v_new_mac := (v_old_stock * v_old_cost + v_new_qty * v_new_cost) / (v_old_stock + v_new_qty);
  ELSE
    v_new_mac := v_new_cost;
  END IF;

  UPDATE products
  SET cost_ref = v_new_mac
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_product_mac() TO anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_mac ON stock_movements;

CREATE TRIGGER trg_product_mac
AFTER INSERT ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION recompute_product_mac();
