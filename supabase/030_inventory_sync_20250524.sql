-- 030_inventory_sync_20250524.sql
-- Sync de inventario físico al 20/05/2026 desde Excel del staff.
-- Aplica 3 cosas:
--   1. 41 updates de stock_quantity para productos ya en DB (matched)
--   2. 32 productos cantina-vendibles packaged no contados → stock = 0
--      (se excluyen cafés, comidas y bebidas hechas al momento — su stock
--       depende de MP, no es contable directamente)
--   3. 27 productos nuevos del Excel — creados con precio = 0 (ajustar en
--      Config). Vendibles van con is_cantina=true; el resto Materia Prima.
--      Aceite De Oliva entra con unit_label='ml' (vino "250 ML" en Excel).
-- LECHE y CAFÉ EN GRANOS se convierten a ml/g para que recetas resten exacto.

-- ─── PARTE 1: matches (43 items, 41 cambios — Bombita/Halls quedaron igual)
UPDATE products SET stock_quantity = 72   WHERE id = 'a1ab709a-4f2c-4d3b-bc9a-2c210d7287df'; -- Cerveza Solera
UPDATE products SET stock_quantity = 35   WHERE id = '7686cf49-aff5-45aa-b80e-bd2981c821d9'; -- Cheese Tris
UPDATE products SET stock_quantity = 51   WHERE id = '32c0e5e5-87a6-4bf4-85fd-bf35e471e955'; -- Helados 1.5
UPDATE products SET stock_quantity = 52   WHERE id = '0241f124-d435-4093-af6e-e9d7c55c1f35'; -- Malta
UPDATE products SET stock_quantity = 45   WHERE id = 'd6b09e78-d895-47ca-a8f6-b8f322f2a08f'; -- Doritos
UPDATE products SET stock_quantity = 68   WHERE id = '6f02cd30-52bd-4264-b32a-3521030ebe0f'; -- Helados 2
UPDATE products SET stock_quantity = 24   WHERE id = 'cfd152ac-b677-4f6e-a310-361b60d56b88'; -- Agua 330ml
UPDATE products SET stock_quantity = 13   WHERE id = '7924ffaf-ea58-49e9-8f34-10abb72cb0ab'; -- Roscos De Anís
UPDATE products SET stock_quantity = 238  WHERE id = '6109d6e8-1ee4-42a9-b8f2-51ea726043f7'; -- Agua 600ml
UPDATE products SET stock_quantity = 28   WHERE id = '43f2d80f-711e-4177-99e2-e119e2f37df6'; -- Palitos Chocolate
UPDATE products SET stock_quantity = 166  WHERE id = 'a2cdd27c-e458-439c-be14-9be8b618a492'; -- Agua 1.5l
UPDATE products SET stock_quantity = 9    WHERE id = 'f1e5123f-3cca-4752-bb57-dd82a1173195'; -- Harinana Galletas
UPDATE products SET stock_quantity = 38   WHERE id = 'ccb0b4df-f888-4108-94fd-b6cac1ecfc1d'; -- Power Max
UPDATE products SET stock_quantity = 3    WHERE id = 'f1a48825-fbec-4d7a-adb2-c8a6fb6b71d9'; -- Salserito
UPDATE products SET stock_quantity = 28   WHERE id = '319ae268-da86-451d-a277-83cff7e39c24'; -- Natuflow
UPDATE products SET stock_quantity = 30   WHERE id = '14854efb-58cd-42f1-8d51-b9ce0921e00f'; -- Granola
UPDATE products SET stock_quantity = 7    WHERE id = 'f9cc9e38-36a3-4f29-8de9-825d7594745d'; -- Pepito
UPDATE products SET stock_quantity = 10   WHERE id = 'c760685c-dec4-4f9e-8e45-4b8de78fc9f7'; -- Arizona Lata
UPDATE products SET stock_quantity = 19   WHERE id = '72d659ae-1047-451f-91d0-c8bac275ca26'; -- Flips
UPDATE products SET stock_quantity = 35   WHERE id = 'c51e752c-6545-497b-b888-9da55dd0a4d2'; -- Lipton
UPDATE products SET stock_quantity = 3    WHERE id = 'd2fa925d-3fcd-4486-808f-9e625967a88b'; -- Power Snack
UPDATE products SET stock_quantity = 30   WHERE id = 'e0104184-dffb-480a-bf8c-fe3f97eea63a'; -- Agua Gas
UPDATE products SET stock_quantity = 9    WHERE id = '45c41096-a129-4839-9eec-b84ea027a50d'; -- Cookies for2
UPDATE products SET stock_quantity = 15   WHERE id = 'a959ad4d-80f0-4a48-bb8b-91ca447ac5df'; -- Cocosette
UPDATE products SET stock_quantity = 72   WHERE id = '50ddfc7a-1341-417e-9c1b-246b36cd1c0c'; -- Gatorade
UPDATE products SET stock_quantity = 16   WHERE id = 'f4f5330d-49cd-4dd2-b8df-7f3e584ef2ac'; -- Susy
UPDATE products SET stock_quantity = 7    WHERE id = '504a0c67-611f-45f1-ad43-4eb476f173a2'; -- Brownie
UPDATE products SET stock_quantity = 15   WHERE id = '37eacb2c-e449-4f83-b2a9-b19ab1469203'; -- Chocolate Cri-Cri
UPDATE products SET stock_quantity = 14   WHERE id = '96533d08-9811-4ced-b8bb-85e74c554815'; -- Chocolate Savoy
UPDATE products SET stock_quantity = 11   WHERE id = 'be6a88c7-4f5d-4aeb-9fba-3ca2bf450376'; -- Cotufas
UPDATE products SET stock_quantity = 13   WHERE id = 'ab0c9e70-066f-4e36-9c6c-b943eefe4879'; -- Toston
UPDATE products SET stock_quantity = 13   WHERE id = '82705a2d-a000-4217-9f77-5166be74531d'; -- Tronkolate
-- Materia Prima ya existente
UPDATE products SET stock_quantity = 29   WHERE id = '873ae406-7393-4f7d-9d06-c10f27a7b5d7'; -- Pollo Parrilla
UPDATE products SET stock_quantity = 9    WHERE id = '9b735f0b-089e-42fa-8aba-25edbd4d64b8'; -- Carne Parrilla
UPDATE products SET stock_quantity = 21   WHERE id = '663e3deb-59f7-4fa9-9e98-84ff1ec74c92'; -- Carne De Hamburguesa
UPDATE products SET stock_quantity = 28   WHERE id = 'e3ab5d13-0b84-4a5e-ab88-7594f0479609'; -- Bolsa De Té
UPDATE products SET stock_quantity = 125  WHERE id = 'c40ca5b9-1534-4227-8636-b4b0765063eb'; -- Tequeño Pasapalo Mp
UPDATE products SET stock_quantity = 21   WHERE id = '25d19d60-37c7-4f34-8718-4ccfdef331ce'; -- Salchichas
UPDATE products SET stock_quantity = 35   WHERE id = 'b84d3db5-21bc-4d66-ad19-a7979f806b81'; -- Facilistas

-- LECHE 25L → 25000ml, CAFÉ 4kg → 4000g (con unit_label para recetas)
UPDATE products SET stock_quantity = 25000, unit_size = 1, unit_label = 'ml'
WHERE id = '47bc197a-8eec-47db-b19a-0d77b9d5333e'; -- Leche Completa
UPDATE products SET stock_quantity = 4000, unit_size = 1, unit_label = 'g'
WHERE id = 'fb380ab5-a17c-4006-979f-012e105fbf9a'; -- Cafe En Granos

-- ─── PARTE 2: zerear 32 packaged no contados (cafés y comidas preparadas se preservan)
UPDATE products SET stock_quantity = 0 WHERE id IN (
  '5bb5089e-9bd7-453d-8b0c-bd66bac2b944','a3ce97e4-824a-4ad4-930d-7ba064f9cee9',
  '97e9cf8f-b907-4635-9a4c-33221f88c44f','a02ed113-2ab2-4c5f-ae8f-3675ff5a848e',
  'dc176e02-e022-461b-b026-415e1b35660f','d8661644-4adc-4ddf-83a7-d9a2bb06052a',
  'e20f3258-c756-47b3-bbd1-d27f8976221d','303077e0-8cac-4126-8716-67568a0f8c42',
  'ba063428-c358-4814-970b-b2f1b75fabdf','0d1ecaf7-b4c5-4015-a44e-85a3a65151b5',
  '58e7cbea-c25e-409f-aa9d-b531f8e01fd0','da9b0cdc-0c20-4c36-ba5d-7051d6a20dc6',
  'oa0kthk4z','62fe6c93-7f82-4078-9cb4-2c953465363e',
  '56c1a36c-8216-4db7-bb29-236dc0358de5','fc5929a5-a084-4a93-b10f-0785be78b457',
  '00cf1128-7c24-4ab2-bbec-341d7aa22531','6e4c718c-4e50-4967-b8b9-c655b2e3d54d',
  '060f0030-8281-4f74-a42b-6697d9397f13','87d46520-4415-4fa5-8fce-9f92df009daa',
  '3273ab1b-2a39-4510-a4a4-8c6ad0ee48fd','b8bcc053-3922-4681-bca4-acc1835cf6b8',
  '4f4068d0-d62a-48f6-ac71-24c304e9c12d','bff2ff20-3bf3-4dfc-b801-bef5ce4d7a26',
  '80418107-ec35-4594-9804-0e7cd22d37eb','8761f76b-fe39-44a0-95ea-53a31fada34d',
  '933c7529-db44-4a62-abd6-b2cbdb8d9aa6','713685df-b2ab-4a12-9dbf-38e38285844f',
  '997b0a40-8929-491f-83e7-da7664a1f63f','72429ffc-d158-422a-93e4-b947339def55',
  '36fb1404-16f0-4063-bd0f-679f8f02d2a0','dfdb9c1d-34fa-407d-9a9e-64a7835193b6'
);

-- ─── PARTE 3: 27 productos nuevos (precio = 0, ajustar en Config)
-- VENDIBLES
INSERT INTO products (id, name, category, price_ref, stock_quantity, is_cantina, active, sort_order) VALUES
  (gen_random_uuid()::text, 'Furia',          'Bebida', 0, 10, true, true, 0),
  (gen_random_uuid()::text, 'Coca Cola Lata', 'Bebida', 0, 14, true, true, 0),
  (gen_random_uuid()::text, 'Granola Barra',  'Snacks', 0, 64, true, true, 0),
  (gen_random_uuid()::text, 'Samba',          'Snacks', 0, 17, true, true, 0),
  (gen_random_uuid()::text, 'Ovomaltina',     'Snacks', 0, 18, true, true, 0),
  (gen_random_uuid()::text, 'Helados 2.5',    'Helados', 0, 0, true, true, 0);

-- MATERIA PRIMA
INSERT INTO products (id, name, category, price_ref, cost_ref, stock_quantity, is_cantina, active, sort_order) VALUES
  (gen_random_uuid()::text, 'Mayonesa',                 'Materia Prima', 0, 0, 1,   false, true, 0),
  (gen_random_uuid()::text, 'Salsa De Tomate',          'Materia Prima', 0, 0, 1,   false, true, 0),
  (gen_random_uuid()::text, 'Mostaza',                  'Materia Prima', 0, 0, 1,   false, true, 0),
  (gen_random_uuid()::text, 'Alas',                     'Materia Prima', 0, 0, 2,   false, true, 0),
  (gen_random_uuid()::text, 'Papas Fritas',             'Materia Prima', 0, 0, 0,   false, true, 0),
  (gen_random_uuid()::text, 'Salsa Soya',               'Materia Prima', 0, 0, 4,   false, true, 0),
  (gen_random_uuid()::text, 'Salsa Bbq',                'Materia Prima', 0, 0, 4,   false, true, 0),
  (gen_random_uuid()::text, 'Vasos Negros',             'Materia Prima', 0, 0, 15,  false, true, 0),
  (gen_random_uuid()::text, 'Vasos 6oz',                'Materia Prima', 0, 0, 181, false, true, 0),
  (gen_random_uuid()::text, 'Vasos 4oz',                'Materia Prima', 0, 0, 100, false, true, 0),
  (gen_random_uuid()::text, 'Vasos 2oz',                'Materia Prima', 0, 0, 74,  false, true, 0),
  (gen_random_uuid()::text, 'Ct4',                      'Materia Prima', 0, 0, 21,  false, true, 0),
  (gen_random_uuid()::text, 'Bti',                      'Materia Prima', 0, 0, 65,  false, true, 0),
  (gen_random_uuid()::text, 'Cti',                      'Materia Prima', 0, 0, 33,  false, true, 0),
  (gen_random_uuid()::text, 'Paquete Bolsa Papel',      'Materia Prima', 0, 0, 2,   false, true, 0),
  (gen_random_uuid()::text, 'Pitillos',                 'Materia Prima', 0, 0, 1,   false, true, 0),
  (gen_random_uuid()::text, 'Porta Perro',              'Materia Prima', 0, 0, 100, false, true, 0),
  (gen_random_uuid()::text, 'Paquete Bolsas Plasticas', 'Materia Prima', 0, 0, 2,   false, true, 0),
  (gen_random_uuid()::text, 'Papelon',                  'Materia Prima', 0, 0, 3,   false, true, 0),
  (gen_random_uuid()::text, 'Aceite',                   'Materia Prima', 0, 0, 4,   false, true, 0);

INSERT INTO products (id, name, category, price_ref, cost_ref, stock_quantity, unit_size, unit_label, is_cantina, active, sort_order)
VALUES (gen_random_uuid()::text, 'Aceite De Oliva', 'Materia Prima', 0, 0, 250, 1, 'ml', false, true, 0);
