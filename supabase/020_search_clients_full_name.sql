-- 020_search_clients_full_name.sql
-- Bug: search_clients no encontraba a "Mauro " (con espacio) porque solo
-- comparaba contra first_name o last_name individualmente. Si el usuario
-- escribe nombre + espacio + apellido (ej "Mauro L"), nunca encuentra.
--
-- Fix: agregar caso adicional matcheando contra "first_name || ' ' || last_name"
-- y normalizar whitespace del input.
--
-- Compatibilidad: mantiene todos los casos previos (first_name, last_name,
-- cedula, phone). Solo agrega un caso más.

CREATE OR REPLACE FUNCTION public.search_clients(query text)
RETURNS TABLE(id text, full_name text, cedula text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT TRIM(REGEXP_REPLACE(COALESCE(query, ''), '\s+', ' ', 'g')) AS qt
  )
  SELECT
    c.id,
    TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS full_name,
    c.cedula
  FROM clients c, q
  WHERE LENGTH(q.qt) >= 2
    AND (
      LOWER(c.first_name) ILIKE LOWER(q.qt) || '%'
      OR LOWER(c.last_name) ILIKE LOWER(q.qt) || '%'
      OR LOWER(TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')))) ILIKE LOWER(q.qt) || '%'
      OR c.cedula ILIKE q.qt || '%'
      OR c.phone ILIKE q.qt || '%'
    )
  ORDER BY c.first_name ASC
  LIMIT 10;
$function$;
