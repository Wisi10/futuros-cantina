-- ============================================================
-- 045: Cleanup suppliers test (Arabito) + soft delete inactivo
-- ============================================================
-- Aplicada via MCP execute_sql el 2026-06-09.
--
-- Decisiones de Sam:
-- 1. ALIMENTOS ARABITO, C.A: era test del Bot WhatsApp (1 restock $5.22,
--    created_by="Bot (soukiwisam)"). Hard delete del restock + supplier.
--    El producto referenciado (Cafe Guayoyo-Pequeño (6), id l3ivbqqrv)
--    quedó en products (ya inactive) porque tiene FK en loyalty_redemptions.
-- 2. Distribuidora Caracas: 0 restocks histórico, soft delete para no
--    aparecer en pickers.
-- 3. Papelón Casanay vs Papelón MP: Sam dijo "dejar" — no tocar.
--
-- Resultado: 17 → 15 suppliers activos.
-- ============================================================

DELETE FROM cantina_restocks WHERE id = '4b94ycxxu'; -- restock test Bot
DELETE FROM suppliers WHERE id = 'sup_f62c7e063f5551'; -- ALIMENTOS ARABITO, C.A
UPDATE suppliers SET active = false WHERE name = 'Distribuidora Caracas';
