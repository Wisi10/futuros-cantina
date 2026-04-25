# RESUMEN — Futuros Cantina POS

Generado: 2026-04-25. Repo auditado commit `aec8f39`.

---

## 1. Stack y arquitectura

- **Framework**: Next.js 14.2.21 (App Router)
- **React**: 18.3.1
- **Styling**: Tailwind CSS 3.4.17 (clases inline, sin CSS separado)
- **Icons**: lucide-react 0.468.0
- **Export**: xlsx 0.18.5 (para reportes Excel)
- **DB**: @supabase/supabase-js 2.49.1 (solo anon key, client-side)
- **State**: useState puro — sin Context, Redux, Zustand ni stores globales
- **Auth**: PIN numerico de 4 digitos contra `user_profiles.pin`. Se guarda en `sessionStorage`. No usa Supabase Auth.
- **Hosting**: Vercel — `futuros-cantina.vercel.app`
- **Repo**: github.com/Wisi10/futuros-cantina (branch: main, solo branch activo)
- **Supabase**: proyecto compartido con futuros-demo (`psxdtifmxgdxasevwkiy`)

### Estructura de carpetas

```
app/
  page.jsx              — Login (PIN)
  pos/page.jsx          — Hub principal del POS (673 lineas)
  layout.jsx            — Root layout + PWA meta
components/
  vender/               — ProductGrid, CartSidebar, PaymentModal, SuccessScreen, CreditsModal
  inventario/           — InventarioView, RestockForm, StockAdjustModal
  shifts/               — ShiftPill, OpenShiftModal, CloseShiftModal, ShiftsView
  caja/                 — CajaView
  gastos/               — GastosView
  reportes/             — ReportesView
  config/               — ConfigView
  nav/                  — SideNav
  shared/               — RateChip
  PinLogin.jsx          — Keypad de PIN
lib/
  supabase.js           — Cliente Supabase (anon key, 9 lineas)
  utils.js              — formatREF, formatBs, calcBs, generateId, PAYMENT_METHODS, EXPENSE_CATEGORIES, METHOD_LABELS
public/
  manifest.json + sw.js + icons/  — PWA
```

**Total: 24 archivos, ~4,225 lineas de codigo.**

---

## 2. Base de datos (solo tablas que usa cantina)

La cantina comparte la instancia Supabase con futuros-demo. Las tablas exclusivas de cantina son:

### Tablas con datos

| Tabla | Filas | Descripcion |
|-------|-------|-------------|
| `products` | 101 | Catalogo completo (cantina + eventos). Cantina filtra por `is_cantina=true` |
| `exchange_rates` | 59 | Historial de tasas EUR/USD (compartida con futuros-demo) |
| `user_profiles` | 8 | Usuarios del sistema (compartida con futuros-demo) |

### Tablas vacias (0 filas) — app en pre-produccion, sin ventas reales aun

| Tabla | Columnas principales |
|-------|---------------------|
| `cantina_sales` | id, sale_date, items(jsonb), total_ref, total_bs, payment_method, payment_status, client_id, client_name, exchange_rate_bs, shift_id, created_by |
| `cantina_credits` | id, client_id, client_name, sale_id, original_amount_ref, paid_amount_ref, status(pending/partial/paid), due_date |
| `cantina_credit_payments` | id, credit_id, amount_ref, amount_bs, payment_method, reference |
| `cantina_expenses` | id, expense_date, category, description, amount_ref, amount_bs, amount_usd, payment_method |
| `cantina_restocks` | id, restock_date, items(jsonb), total_cost_ref, supplier |
| `stock_movements` | id, product_id, product_name, movement_type(sale/adjustment/restock), quantity, reference_id, cost_ref |
| `restock_purchases` | id, product_id, product_name, quantity, cost_per_unit_ref, cost_per_unit_usd, supplier |
| `shifts` | id, opened_by, opened_at, opening_cash_bs/usd, closed_by, closed_at, closing_cash_bs/usd_expected/actual, difference_bs/usd, status(open/closed), notes |

### Foreign keys

| Tabla | Columna | Referencia |
|-------|---------|------------|
| `cantina_sales.shift_id` | → `shifts.id` | Nullable (ventas historicas sin turno) |

### Indices relevantes

| Indice | Tabla | Tipo |
|--------|-------|------|
| `idx_shifts_one_open` | shifts | **UNIQUE** partial WHERE status='open' — maximo 1 turno abierto |
| `idx_cantina_sales_date` | cantina_sales | btree en sale_date |
| `idx_cantina_sales_client` | cantina_sales | btree en client_id |
| `idx_cantina_credits_client` | cantina_credits | btree en client_id |
| `idx_cantina_credits_status` | cantina_credits | btree en status |
| `idx_stock_movements_product` | stock_movements | btree en product_id |
| `products_name_unique` | products | UNIQUE en name |

### RLS

Todas las tablas cantina tienen RLS habilitado con policy `TO authenticated USING (true)`. Nota: la app usa anon key (no authenticated), asi que hay una policy extra `anon_pin_login` en `user_profiles` para permitir login por PIN.

---

## 3. Features activas (por tab)

### Vender (tab principal)
- **Archivos**: `pos/page.jsx`, `ProductGrid.jsx`, `CartSidebar.jsx`, `PaymentModal.jsx`, `SuccessScreen.jsx`, `CreditsModal.jsx`
- **Estado**: ✅ Completo
- **Flujos**:
  - Catalogo de productos con categorias y buscador
  - Agregar al carrito con control de stock
  - Checkout con 4 metodos de pago (Pago Movil, Cash Bs, Cash USD, Zelle)
  - Venta a credito (fiado) con busqueda de cliente en tabla `clients`
  - Confirmacion antes de ejecutar
  - Anulacion de ultima venta (ventana de 5 minutos)
  - Carrito persiste en sessionStorage
  - **Requiere turno abierto para vender** (modal bloqueante si no hay turno)

### Inventario
- **Archivos**: `InventarioView.jsx`, `RestockForm.jsx`, `StockAdjustModal.jsx`
- **Estado**: ✅ Completo
- **Flujos**:
  - Dashboard de stock con KPIs (sin stock, stock bajo, valor total, pagado proveedores)
  - Tabla de productos con filtro por categoria y buscador
  - Ajuste manual de stock (con motivo: conteo, perdida, donacion, otro)
  - Registro de entrada/restock (con items, proveedor, costos)
  - Historial de entradas ultimos 30 dias

### Caja
- **Archivos**: `CajaView.jsx`
- **Estado**: ✅ Completo
- **Flujos**:
  - KPIs del dia: total ventas, # ventas, creditos, efectivo
  - Desglose por metodo de pago
  - Lista de ventas expandible con detalle de items
  - Selector de fecha (admin only)
  - Export Excel (admin only)

### Gastos
- **Archivos**: `GastosView.jsx`
- **Estado**: ✅ Completo
- **Flujos**:
  - Formulario de registro de gasto (categoria, monto en REF/Bs/USD, metodo de pago)
  - Lista filtrable por periodo (hoy, semana, mes, custom)
  - Desglose por categoria (barra visual)
  - Categorias: Insumos de cocina, Limpieza, Equipos, Gas/electricidad, Personal, Transporte, Comisiones, Otros

### Turnos
- **Archivos**: `ShiftPill.jsx`, `OpenShiftModal.jsx`, `CloseShiftModal.jsx`, `ShiftsView.jsx`
- **Estado**: ✅ Completo
- **Flujos**:
  - Pill en header con dot verde pulsante (abierto) o gris (cerrado)
  - Abrir turno: declarar efectivo inicial Bs/USD
  - Cerrar turno: resumen de ventas, desglose por metodo, esperado vs contado, diferencia coloreada
  - Historial de turnos con detalle expandible
  - Solo 1 turno abierto a la vez (unique index en DB)
  - Turno persiste al refresh (query a DB on mount)

### Reportes
- **Archivos**: `ReportesView.jsx`
- **Estado**: ✅ Completo
- **Flujos**:
  - KPIs: ventas, gastos, utilidad (margen %), creditos pendientes
  - P&L por producto: unidades, revenue, costo, margen
  - Desglose por metodo de pago
  - Creditos pendientes (top 10 con antiguedad)
  - Historial de ventas
  - Export Excel con 4 hojas (Ventas, Gastos, Creditos, Inventario)

### Config (admin only)
- **Archivos**: `ConfigView.jsx`
- **Estado**: ✅ Completo
- **Flujos**:
  - Actualizar tasa de cambio (EUR/USD) con historial de 7 dias
  - Editor de productos: nombre, precio, costo, emoji, categoria, alerta stock, is_cantina, activo

---

## 4. Bugs conocidos y deuda tecnica

### TODO/FIXME/HACK
**Ninguno encontrado** — codigo limpio de marcadores de deuda.

### Tildes y enes en UI
**~50 instancias** de caracteres acentuados en texto visible al usuario. Regla del proyecto dice "sin tildes ni enies". Ejemplos:
- `"Error de conexión"` (page.jsx:35)
- `"Crédito"` en multiples archivos
- `"¿Seguro que quieres anular esta venta?"` (pos/page.jsx:395)
- `"Configuración"` (ConfigView.jsx:86)
- `"Pérdida"` (StockAdjustModal.jsx:8)
- `"Categoría"` (ConfigView.jsx:251)

**Accion requerida**: limpiar todas las tildes/enes en texto UI.

### Valores hardcodeados que deberian ser configurables
- Ventana de anulacion: 5 minutos (pos/page.jsx:178)
- Alerta stock bajo default: 5 unidades (multiples archivos)
- Timezone: `"America/Caracas"` hardcodeado en 5+ archivos
- Locale: `"es-VE"` hardcodeado en 20+ archivos
- Limite historial turnos: 50 (ShiftsView.jsx:21)
- Limite busqueda clientes: 10 (PaymentModal.jsx:44)

### Inconsistencias
- `cantina_sales.payment_method` es `NOT NULL` pero ventas a credito pasan `null` — el insert funciona porque PostgREST no aplica el constraint strictamente. Deberia ser nullable.
- `products` no tiene FK desde `stock_movements.product_id` ni `restock_purchases.product_id`
- `cantina_credits` no tiene FK desde `cantina_credit_payments.credit_id`

---

## 5. Patrones del repo

### Formularios
- useState por campo, no form libraries
- Validacion inline antes del submit
- `window.confirm()` para confirmaciones destructivas (excepto venta que tiene modal custom)

### Modales
- `fixed inset-0 bg-black/50 z-50 flex items-center justify-center`
- Contenido en `bg-white rounded-2xl shadow-xl max-w-sm/md`
- Boton X arriba-derecha con `lucide-react X`
- Sin portal — render inline en el componente padre

### Helpers (`lib/utils.js`)
- `formatREF(n)` → `"REF X.XX"`
- `formatBs(ref, rate)` → `"Bs X.XXX,XX"` (formato venezolano)
- `calcBs(ref, rate)` → numero
- `generateId()` → random base36 de 9 chars
- `PAYMENT_METHODS` → array de {id, label, icon, needsRef}
- `EXPENSE_CATEGORIES` → array de strings
- `METHOD_LABELS` → map id→label

### Supabase (`lib/supabase.js`)
- Solo anon key via `NEXT_PUBLIC_*`
- Un unico cliente exportado como `supabase`
- No hay service role — todo client-side
- RLS: policy `TO authenticated USING (true)` + `anon_pin_login` para login

### Naming
- Componentes: PascalCase (`ProductGrid.jsx`)
- Carpetas: kebab-case o singular (`vender/`, `inventario/`)
- Variables: camelCase
- DB columns: snake_case
- IDs en DB: text con `gen_random_uuid()` o `generateId()`

---

## 6. Estado de Git

- **Branch**: `main` (unico branch activo)
- **Remote**: `origin → github.com/Wisi10/futuros-cantina.git`
- **Cambios sin commitear**: ninguno
- **Ultimos 5 commits**:

| Hash | Mensaje | ~Fecha |
|------|---------|--------|
| `aec8f39` | Fase 1A: Sistema de turnos (shifts) con reconciliacion de caja | 2026-04-22 |
| `921f216` | Add PWA support, cart persistence, and polish improvements | anterior |
| `425f829` | fix: 5 bugs + buscador productos + confirmar/anular ventas | anterior |
| `3040f0c` | feat: fix Vender categorias + rediseno POS + dashboard Inventario | anterior |
| `eb794fa` | feat: fix productos (RLS), rediseno POS categorias, tab Caja | anterior |

---

## 7. Dependencias y configuracion critica

### Variables de entorno requeridas
| Variable | Donde |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | .env.local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | .env.local |

No hay service role key, no hay API keys externas, no hay webhooks.

### Dependencias externas
- **Supabase** (unica): URL `https://psxdtifmxgdxasevwkiy.supabase.co`
- DB password: `mezras-qijfEg-2bycco`
- DB host directo: `db.psxdtifmxgdxasevwkiy.supabase.co` (actualmente no resuelve via IPv4 — usar `npx supabase db query` con connection string)
- Vercel: deploy via `npx vercel --prod`

### PWA
- `manifest.json` con iconos 192/512 + maskable
- `sw.js` minimo (network-first, solo para instalabilidad)
- Theme color: `#B8963E` (gold)

---

## 8. Cosas que vale la pena revisar

1. **0 ventas en produccion** — todas las tablas operativas estan vacias. La app esta en pre-produccion. Los 101 productos estan cargados y listos, pero nadie ha vendido aun.

2. **Todos los products.stock_quantity = 50** — looks like seed data, no stock real. Cuando arranquen produccion necesitan hacer un conteo real.

3. **cantina_sales.payment_method es NOT NULL** pero ventas a credito pasan `null` — potencial error silencioso. Corregir a nullable o guardar `"credit"` como metodo.

4. **No hay FK entre stock_movements→products ni cantina_credit_payments→cantina_credits** — integridad referencial depende del app code, no de la DB.

5. **Tildes en UI** — ~50 instancias violan la regla "sin tildes ni enes". Limpiar antes de produccion.

6. **Anon key + RLS** — la app usa anon key pero la mayoria de policies son `TO authenticated`. Solo funciona porque se agrego `anon_pin_login` manualmente. Si alguien borra esa policy, el login se rompe. Considerar usar service role via API route para operaciones criticas.

7. **Sin backup/export de datos** — no hay cron ni mecanismo de respaldo. Los reportes Excel son manuales.

8. **Carrito en sessionStorage** — se pierde al cerrar el browser (no la pestana). Considerar localStorage si quieren persistencia mas larga.
