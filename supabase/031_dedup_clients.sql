-- 031_dedup_clients.sql
-- Mergea 21 clientes duplicados detectados en 11 grupos. Para cada grupo,
-- elige un canonical y reapunta TODAS las FK (15 tablas + loyalty_balances
-- con merge especial por PK) al canonical, luego DELETE del duplicado.
--
-- Grupos:
--   A. Clones exactos (mismo nombre+phone+cedula, registros generados por
--      doble-click al crear cliente): Kevin García×5, Omar Araque×3, Diego
--      Ramírez×3, Henrry Vasquez×2, Santiago Mendoza×2.
--   B. Phone con typo (mismo número con/sin código país duplicado o chars
--      Unicode): Gabriel Rojas, Ricardo Narvaez, Sebastián Mosquera, Dora
--      Bisarini, Jesus Mora.
--   D. "Simple Empresa" ×7 — placeholders sin datos, merge en uno.
--
-- Canonicals elegidos por: (1) tiene cédula > sin cédula, (2) phone limpio
-- > phone con typos, (3) más viejo (tiebreaker).

DO $$
DECLARE
  pair RECORD;
  dup_lb RECORD;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('c8f56v4y3',     'zp9bot396'),
      ('c8f56v4y3',     'y74zxr5mw'),
      ('c8f56v4y3',     'drigzwo2g'),
      ('c8f56v4y3',     '7gh6aey9x'),
      ('jlh0h84gc',     'idhrr0acx'),
      ('jlh0h84gc',     'lif1v4bok'),
      ('vcq3k1n3w',     '0lhbrdl1q'),
      ('vcq3k1n3w',     'uvhi8n8vt'),
      ('lqtf969vk',     'wqos7589j'),
      ('lppfznjpq',     '4lgmso3gc'),
      ('1s29uy1dg',     'cli_d2191e4db7'),
      ('cli_2508d49a6e','f6ugdcm19'),
      ('fgobyqueh',     '96vxypofp'),
      ('on8ahpaow',     'rty5k45bz'),
      ('5a1nh6i5q',     'mde88gux3'),
      ('88asljy4b',     'oeykue4q3'),
      ('88asljy4b',     'dqcswrco8'),
      ('88asljy4b',     'ijy4rsowb'),
      ('88asljy4b',     'yjklgwcdy'),
      ('88asljy4b',     't65pztvg6'),
      ('88asljy4b',     'u965j65w0')
    ) AS t(canonical, dup)
  LOOP
    UPDATE activity_log             SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE bookings                 SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE cancellations            SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE cantina_credits          SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE cantina_sales            SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE client_agreements        SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE client_alerts            SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE client_convenios         SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE client_credits           SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE cortesia_audit_log       SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE events                   SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE loyalty_redemptions      SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE loyalty_transactions     SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE payments                 SET client_id = pair.canonical WHERE client_id = pair.dup;
    UPDATE weekly_promo_redemptions SET client_id = pair.canonical WHERE client_id = pair.dup;

    SELECT * INTO dup_lb FROM loyalty_balances WHERE client_id = pair.dup;
    IF FOUND THEN
      INSERT INTO loyalty_balances (client_id, points_balance, last_activity_at, updated_at)
      VALUES (pair.canonical, dup_lb.points_balance, dup_lb.last_activity_at, NOW())
      ON CONFLICT (client_id) DO UPDATE SET
        points_balance   = loyalty_balances.points_balance + EXCLUDED.points_balance,
        last_activity_at = GREATEST(loyalty_balances.last_activity_at, EXCLUDED.last_activity_at),
        updated_at       = NOW();
      DELETE FROM loyalty_balances WHERE client_id = pair.dup;
    END IF;

    DELETE FROM clients WHERE id = pair.dup;
  END LOOP;
END $$;
