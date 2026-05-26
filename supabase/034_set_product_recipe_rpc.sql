-- 034_set_product_recipe_rpc.sql
-- Audit trail del RPC que ya existía en DB sin versionar (BUG 5 audit).
-- Snapshot del cuerpo actual extraído de pg_get_functiondef.
-- Sin cambios funcionales — solo para que el schema sea reproducible
-- desde cero.

CREATE OR REPLACE FUNCTION public.set_product_recipe(
  p_product_id text,
  p_ingredients jsonb,
  p_has_recipe boolean,
  p_cost_override numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ingredient jsonb;
  v_ingr_id text;
  v_inserted integer := 0;
  v_invalid_ingredient text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Producto no encontrado');
  END IF;

  -- Validar: cada ingrediente debe existir y tener has_recipe = false (sin anidar)
  IF p_has_recipe AND p_ingredients IS NOT NULL THEN
    FOR v_ingredient IN SELECT * FROM jsonb_array_elements(p_ingredients)
    LOOP
      v_ingr_id := v_ingredient->>'ingredient_id';
      IF v_ingr_id IS NULL OR v_ingr_id = '' THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_ingr_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ingrediente no encontrado: ' || v_ingr_id);
      END IF;
      IF EXISTS (SELECT 1 FROM products WHERE id = v_ingr_id AND has_recipe = true) THEN
        SELECT name INTO v_invalid_ingredient FROM products WHERE id = v_ingr_id;
        RETURN jsonb_build_object('success', false, 'error', 'No se permiten recetas anidadas: ' || COALESCE(v_invalid_ingredient, v_ingr_id) || ' tambien tiene receta');
      END IF;
    END LOOP;
  END IF;

  DELETE FROM product_recipes WHERE product_id = p_product_id;

  IF p_has_recipe AND p_ingredients IS NOT NULL THEN
    FOR v_ingredient IN SELECT * FROM jsonb_array_elements(p_ingredients)
    LOOP
      INSERT INTO product_recipes (id, product_id, ingredient_id, quantity, unit, notes)
      VALUES (
        'rec_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
        p_product_id,
        v_ingredient->>'ingredient_id',
        COALESCE((v_ingredient->>'quantity')::numeric, 0),
        COALESCE(v_ingredient->>'unit', 'unidad'),
        v_ingredient->>'notes'
      );
      v_inserted := v_inserted + 1;
    END LOOP;
  END IF;

  UPDATE products
  SET has_recipe = p_has_recipe,
      recipe_cost_override = p_cost_override
  WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'ingredients_count', v_inserted);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_product_recipe(text, jsonb, boolean, numeric)
  TO anon, authenticated;
