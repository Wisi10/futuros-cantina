# CLAUDE.md — futuros-cantina

Convenciones, patrones y reglas obligatorias para trabajar en este repo.
Lee este archivo PRIMERO en cada sesion. Para features historicas ver `RESUMEN.md`.

---

## 1. Stack

- Next.js 14 (App Router, `app/`)
- React 18+ functional components con hooks
- Supabase (Postgres + RLS + RPC + Storage). Anon key client-side, service role solo via PAT
- Tailwind CSS utility classes (no CSS modules, no shadcn/ui)
- Lucide React para iconos
- Vercel deployment, branch `main` solamente
- chart.js + react-chartjs-2, html2canvas, xlsx, react-window (verificar `package.json` antes de agregar deps)

---

## 2. Reglas obligatorias (NUNCA romper)

- **REF moneda primaria.** NUNCA mostrar "EUR" en UI. Helper `formatREF(n)` -> `REF X.XX`. Conversion a Bs solo display secundario.
- **Sin tildes ni enes** en strings nuevos: Maniana, Companias, Saldado, Anadir, Pequeno, etc.
- **Mobile responsive 375px minimo.** Cada vista nueva debe probarse mental o visualmente en mobile. Flex chains usan `min-h-0` para evitar bug de scroll.
- **Soft delete con `active = false`.** NUNCA hard delete. Rompe historial en `cantina_sales.items` jsonb + audit trails.
- **NO `npm run dev`.** Workflow es: edit -> `npm run build` -> commit -> `git push origin main` -> `npx vercel --prod`.
- **No bypassar git hooks** (`--no-verify`) ni gpg sign skip.

---

## 3. Auth y permisos

- PIN-based: `1234` staff, `9999` admin. NO Supabase Auth.
- Role flag: `user?.cantinaRole === "admin"` o `"staff"`.
- Gates por permiso (no tab-wide):
  - Admin only: eliminar producto, borrar pago, override costo receta, cortesia, marcar evento saldado, configurar premios/categorias/threshold.
  - Cortesia adicional: requiere `saleClient.id`, NO suma puntos loyalty, NO entra a caja.
  - Staff + admin: ver clientes, registrar pago a evento, marcar evento celebrado, agregar item extra a evento.

---

## 4. Patrones codigo

### RPCs Supabase
- `SECURITY DEFINER` + `SET search_path = public`
- `GRANT EXECUTE ON FUNCTION xxx(...) TO anon, authenticated`
- Naming `verb_subject` snake_case: `get_cantina_clients_summary`, `register_event_payment`, `mark_event_consumed`
- Args con prefix `p_`: `p_event_id`, `p_amount_ref`
- Migrations numeradas en `supabase/NNN_descripcion.sql` como audit trail (el SQL real se aplica via PAT; archivo es solo doc)

### Schema
- snake_case tablas y columnas
- `active boolean DEFAULT true` para soft delete
- `created_at timestamptz DEFAULT NOW()`
- IDs string con prefix: `cli_`, `pay_`, `evpay_`, `tr_`, `evcons_`, `sm_`, `csp_`, `ei_`, `rec_`, `cat_`
- Foreign keys con `ON DELETE CASCADE` para children, `ON DELETE SET NULL` para refs opcionales

### Componentes React
- Modales pattern: `{isOpen && <Modal onClose={..} onSaved={..} />}`. Click fuera cierra. Esc cierra.
- Lists: state local + load via supabase client o RPC. Reload despues de mutations.
- Context para state compartido cross-component (ej. `ClientProfileContext` para abrir modal global desde cualquier link).
- Lazy load via picker inline (no modal anidado) cuando es busqueda dentro de modal.

### Estilos
- Paleta brand: `bg-brand` burgundy, `text-brand`, `text-gold` (#B8963E), `bg-brand-cream-light`.
- Estados:
  - Verde: pagado, saldado, activo, stock ok
  - Amarillo: parcial, pendiente, stock bajo
  - Rojo: pendiente consumir, sin stock, perdida, RESTA
  - Violeta: parcial (intercompany)
- Badges chicos: `text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded`
- Cards: `bg-white rounded-xl border border-stone-200 p-3`

### Filenames
- Componentes PascalCase: `EventDetailModal.jsx`, `CategoriesEditor.jsx`
- Helpers camelCase: `clientHelpers.js`, `stockHelpers.js`, `recipeHelpers.js`
- Folders: `components/eventos/`, `components/clientes/`, `lib/`

---

## 5. Schemas clave

### Compartidas con futuros-demo (NO crear duplicadas)
- `clients` — clientes (1300+ rows, shared). Cantina lee y escribe directo.
- `events`, `event_items`, `event_payments`, `event_consumptions` — eventos cumpleanos
- `bookings`, `payments` — reservas + pagos cliente al complejo
- `intercompany_transfers` — pagos complejo a cantina

### Exclusivas cantina
- `products` con `is_cantina`, `has_recipe`, `recipe_cost_override`, `is_redeemable`, `redemption_cost_points`, `active`, `low_stock_alert`
- `cantina_sales` (header) + `cantina_sale_payments` (1:N, sprint 7B). `payment_method` legacy en sales puede ser `mixed`.
- `cantina_sale_payments`: `amount_ref` signed (negativo para vueltos con `is_change=true`)
- `cantina_credits` + `cantina_credit_payments`
- `stock_movements` — audit cambios stock. `movement_type`: sale/recipe_consumption/event_consumption/adjustment/restock/<type>_reverse
- `product_recipes` — M:N producto -> ingredientes (1 nivel, no anidado)
- `loyalty_balances`, `loyalty_transactions`, `loyalty_redemptions` — FK a `clients(id)`
- `shifts` — turnos. Solo 1 abierto a la vez (unique index `status='open'`)
- `app_settings` (key/jsonb) — `vip_threshold`, `low_stock_threshold`, etc.
- `product_categories` — categorias editables (CANTINA_CATEGORIES en lib/utils.js es fallback)

---

## 6. UI conventions

### Currency
- `formatREF(value)` y `formatBs(value, rate?.eur)` desde `lib/utils.js`
- `calcBs(ref, rate)` para math sin formato
- Tasa: leer del context o `rate` prop (loaded en pos/page.jsx via `exchange_rates`)

### Date / time
- TZ siempre `America/Caracas`
- `todayCaracas()` -> ISO YYYY-MM-DD en TZ Caracas
- `fmtDate(iso)` -> DD/MM/YYYY
- `relativeFromNow(iso)` -> "hace 2d", "hace 5min"

### Badges estado
- Pendiente amarillo / Parcial violeta / Pagado verde / Saldado verde / Consumido verde
- "Pendiente consumir" rojo cuando `event_date < hoy AND is_consumed=false`

### Inputs numericos
- `type="number" step="1"` para enteros (qty stock)
- `step="0.01"` para REF / dinero
- Validar siempre `Number.isFinite` + `> 0`

### Tablas
- `<thead>` con `bg-stone-50 text-stone-500 text-xs uppercase`
- `<tbody>` rows con `border-t border-stone-100`
- Subtotal/total row `bg-stone-50 font-bold` con `border-t-2 border-stone-200`

---

## 7. Deploy

```bash
npm run build                     # debe pasar 0 errores
git add <files>
git commit -m "feat(scope): ..."  # mensaje en presente, scope opcional
git push origin main
npx vercel --prod --yes
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://futuros-cantina.vercel.app/
```

Co-author footer obligatorio en commits hechos por Code:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## 8. Cosas que NO hacer

- Hard delete (DELETE FROM) en `products`, `clients`, `cantina_sales`, `events`
- Mostrar "EUR" en cualquier string visible al usuario
- Tildes/enes en strings nuevos
- `npm run dev` o servidor local
- Agregar deps sin checar `package.json` (puede haber alternativa instalada)
- Crear tabla cantina_* que duplique funcionalidad de tabla shared con demo
- Romper sync cross-repo: `clients`, `events`, `event_items`, `event_payments`, `bookings`, `payments`, `intercompany_transfers` son SHARED
- Modificar `RESUMEN.md` (es snapshot historico)
- Recetas anidadas (ingredient.has_recipe=true esta bloqueado en RPC y UI)
- Crear venta sin entrar a tabla `cantina_sale_payments` (sprint 7B requirement, vistas de Caja/Reportes/CloseShift dependen de esta tabla)

---

## 9. Workflow con Code (asistente)

- Sam pasa prompts .md generados desde Claude chat
- Code lee `CLAUDE.md` y `RESUMEN.md` al inicio de cada sesion
- Sprints grandes (toca venta, schema, multi-tab): Fase 1 diagnostico antes de codigo. Espera OK del usuario antes de Fase 2
- Sprints chicos: modo express directo, build -> commit -> deploy
- Reporte final breve: archivos modificados, 1-3 tests mentales, URL deploy
- Schema migrations: aplicar via PAT (mcp tool `apply_migration`). Archivo `.sql` en `supabase/` es audit trail
- Si encuentra blocker (deps prohibidas, decision arquitectural), para y reporta antes de continuar

---

## 10. Sprints historicos (orden cronologico)

Sprints completados, referencia para entender evolucion:

1. Core POS — Vender, Carrito, PaymentModal, SuccessScreen
2. Caja + Excel export + KPIs dia
3. Gastos + Inventario + Restock
4. Turnos (1 abierto a la vez, unique index) + Cierre con cuadre
5. Reportes basicos (KPIs sin graficos)
6. Cortesia (admin, requiere cliente, no afecta caja)
7. Profitability (margin per product) + premios week (revertido luego)
7B. Pago mixto + datafono + sobrepago (vuelto/credito) + cantina_sale_payments
8. Loyalty (puntos, ranking, premios canjeables) + Tab Puntos
9. Eventos v1: tab unificado demo+cantina con deuda intercompany
10. Eventos v2: cronologico + fecha prominente + close-out REF 0
11. Eventos v3: stock alerts + mark consumed + revert 24h + recetas
12. Tab Clientes + Reportes con graficos (chart.js) + Stock alert toast
13. 6 UI fixes: hyperlinks clientes + search global + equidistant timeline + dashboard removido
14. Bot inventario WhatsApp staff (compras via WA -> products)
15. Subtab Eventos en Inventario (split materia prima vs eventos)
16. Modal evento paridad demo (Items combo + Resumen + Pagos cliente + Agregar extra)
17. Mobile scroll fix (min-h-0 en flex chain)
18. CLAUDE.md creado (este archivo)

Para detalles tecnicos de cada sprint ver commits en `git log`.
