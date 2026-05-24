-- 027_cantina_sales_sale_number.sql
-- Numero secuencial legible para cada venta de cantina. El id text/uuid no
-- sirve para referenciar verbalmente; el staff necesita "Venta #N" tanto en
-- la pantalla post-venta como en reportes y reconciliacion.

CREATE SEQUENCE IF NOT EXISTS cantina_sales_sale_number_seq;

ALTER TABLE cantina_sales ADD COLUMN IF NOT EXISTS sale_number bigint;

-- Backfill cronologico: la venta mas vieja queda #1.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n
  FROM cantina_sales
)
UPDATE cantina_sales c
SET sale_number = o.n
FROM ordered o
WHERE c.id = o.id AND c.sale_number IS NULL;

-- Avanzar la secuencia al ultimo numero backfilleado.
SELECT setval(
  'cantina_sales_sale_number_seq',
  COALESCE((SELECT MAX(sale_number) FROM cantina_sales), 0),
  true
);

ALTER TABLE cantina_sales
  ALTER COLUMN sale_number SET DEFAULT nextval('cantina_sales_sale_number_seq'),
  ALTER COLUMN sale_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cantina_sales_sale_number_key
  ON cantina_sales(sale_number);
