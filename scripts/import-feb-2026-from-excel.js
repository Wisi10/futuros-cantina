// Import Feb 2026 ventas + egresos desde el Excel histórico de cantina.
//
// Input: /Users/wisamsouki/Downloads/INGRESOS Y EGRESOS CANTINA A FEBRERO 2026--2.xlsx
//
// VENTAS sheet:
//   FECHA | Tasa día | Pto.Vta Expr $ | Pto.Vta Bs | Pago Móvil Expr $ | Pago Móvil Bs | Efectivo $
//   → 1 row de cantina_sales por (fecha, método con monto > 0)
//   Métodos mapeados: Pto.Vta → datafono, Pago Móvil → pago_movil, Efectivo → cash_usd
//
// EGRESOS sheet:
//   Fecha | # Factura | Razón Social | Descripción | Tasa | Subtotal | IVA | IGTF | Efectivo $ | Débito Bs | Monto $
//   → 1 row de cantina_expenses por línea
//   Método: si Efectivo $ > 0 → cash_usd; si Débito > 0 → datafono (transfer/POS proveedor); else pago_movil fallback
//
// Categorización egresos: keyword rules sobre (proveedor + descripción) → EXPENSE_CATEGORIES de cantina.
//
// Flags:
//   --dry-run   no inserta, solo cuenta y muestra sample
//   --batch=NN  default 200

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const EXCEL_PATH = '/Users/wisamsouki/Downloads/INGRESOS Y EGRESOS CANTINA A FEBRERO 2026--2.xlsx';

// Cargar .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[m[1]] = process.env[m[1]] || v;
    }
  }
}

const DRY = process.argv.includes('--dry-run');

// Para insert real usamos Management API con PAT (no necesitamos service_role
// porque no está en .env.local). Endpoint:
//   POST https://api.supabase.com/v1/projects/{ref}/database/query
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const PAT = process.env.SUPABASE_ACCESS_TOKEN;
if (!DRY && (!PROJECT_REF || !PAT)) {
  console.error('Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}
async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  return text;
}
function sqlQuote(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}
const BATCH = (() => {
  const a = process.argv.find(x => x.startsWith('--batch='));
  return a ? parseInt(a.slice(8)) : 200;
})();

// ─── Categorización egresos ──────────────────────────────────
const RULES = [
  { cat: 'Limpieza y sanidad', re: /\b(desengras|esponja|jab[oó]n|detergente|suavizante|lavaplatos|cloro|papel higi|desinfect|limpiador|escoba|trapo|guantes|glade|aromatiz|ambientador)\b/i },
  { cat: 'Equipos y mantenimiento', re: /\b(drywall|divisori|parche|caucho|reparac|foco|bombillo|pintura|plomer[ií]a|electric|herramienta|materiales obra|grife|cerradura)\b/i },
  { cat: 'Transporte y fletes', re: /\b(traslado|transporte|gasolina|estacionamiento|peaje|uber|didi|flete)\b/i },
  { cat: 'Gas y electricidad', re: /\b(gas dom|cilindro|recarga gas|corpoelec|electricidad)\b/i },
  // default → "Insumos de cocina"
];

function categorize(text) {
  const t = (text || '').toLowerCase();
  for (const r of RULES) if (r.re.test(t)) return r.cat;
  return 'Insumos de cocina';
}

// ─── Excel parsing ───────────────────────────────────────────
function excelDate(serial) {
  if (typeof serial !== 'number') return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
}
function ymd(d) {
  return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` : null;
}
function isFeb2026(d) { return d && d.getUTCFullYear() === 2026 && d.getUTCMonth() === 1; }

function randId(prefix) {
  return prefix + '_' + Math.random().toString(36).substring(2, 11);
}

function parseSales() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['VENTAS'];
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null}).slice(4).filter(r => r[0] != null);
  const out = [];
  for (const r of rows) {
    const d = excelDate(r[0]);
    if (!isFeb2026(d)) continue;
    const date = ymd(d);
    const tasa = Number(r[1]) || null;
    const ptoVtaUsd = Number(r[2]) || 0;
    const ptoVtaBs = Number(r[3]) || 0;
    const pagoMovilUsd = Number(r[4]) || 0;
    const pagoMovilBs = Number(r[5]) || 0;
    const efectivoUsd = Number(r[6]) || 0;

    if (ptoVtaUsd > 0) out.push({
      id: randId('sm'), sale_date: date, items: [{name: 'Ventas históricas (Tarjeta)', qty: 1, price_per_unit: ptoVtaUsd}],
      total_ref: ptoVtaUsd, total_bs: ptoVtaBs || null, payment_method: 'datafono',
      exchange_rate_bs: tasa, notes: 'Importado del Excel histórico (Feb 2026)', created_by: 'import-script',
      payment_status: 'paid', subtotal_ref: ptoVtaUsd, discount_amount_ref: 0,
    });
    if (pagoMovilUsd > 0) out.push({
      id: randId('sm'), sale_date: date, items: [{name: 'Ventas históricas (Pago Móvil)', qty: 1, price_per_unit: pagoMovilUsd}],
      total_ref: pagoMovilUsd, total_bs: pagoMovilBs || null, payment_method: 'pago_movil',
      exchange_rate_bs: tasa, notes: 'Importado del Excel histórico (Feb 2026)', created_by: 'import-script',
      payment_status: 'paid', subtotal_ref: pagoMovilUsd, discount_amount_ref: 0,
    });
    if (efectivoUsd > 0) out.push({
      id: randId('sm'), sale_date: date, items: [{name: 'Ventas históricas (Efectivo)', qty: 1, price_per_unit: efectivoUsd}],
      total_ref: efectivoUsd, total_bs: null, payment_method: 'cash_usd',
      exchange_rate_bs: tasa, notes: 'Importado del Excel histórico (Feb 2026)', created_by: 'import-script',
      payment_status: 'paid', subtotal_ref: efectivoUsd, discount_amount_ref: 0,
    });
  }
  return out;
}

function parseExpenses() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['EGRESOS'];
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null}).slice(4).filter(r => r[0] != null);
  const out = [];
  for (const r of rows) {
    const d = excelDate(r[0]);
    if (!isFeb2026(d)) continue;
    const date = ymd(d);
    const factura = r[1] != null ? String(r[1]) : null;
    const proveedor = (r[2] || '').toString().trim();
    const descripcion = (r[3] || '').toString().trim();
    const tasa = Number(r[4]) || null;
    const efectivoUsd = Number(r[8]) || 0;
    const debitoBs = Number(r[9]) || 0;
    const montoUsd = Number(r[10]) || 0;
    if (montoUsd <= 0 && debitoBs <= 0 && efectivoUsd <= 0) continue;

    const description = [proveedor, descripcion].filter(Boolean).join(' — ');
    const category = categorize(description);
    const payment_method = efectivoUsd > 0 ? 'cash_usd' : (debitoBs > 0 ? 'datafono' : 'pago_movil');

    out.push({
      id: randId('exp'),
      expense_date: date,
      category,
      description: description || '(sin descripción)',
      amount_ref: montoUsd || (debitoBs && tasa ? debitoBs / tasa : 0),
      amount_bs: debitoBs || null,
      amount_usd: efectivoUsd || null,
      payment_method,
      reference: factura,
      exchange_rate_bs: tasa,
      receipt_note: 'Importado del Excel histórico (Feb 2026)',
      created_by: 'import-script',
    });
  }
  return out;
}

async function insertBatch(table, rows) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const values = slice.map(r => '(' + cols.map(c => sqlQuote(r[c])).join(', ') + ')').join(', ');
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values};`;
    await runSql(sql);
    process.stdout.write(`  ${table}: ${i + slice.length}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${rows.length}/${rows.length} ✓`);
}

(async function main() {
  console.log(`\n=== Feb 2026 import ${DRY ? '(DRY RUN)' : ''} ===\n`);
  const sales = parseSales();
  const expenses = parseExpenses();

  // Summary
  const salesByMethod = {};
  let salesTotalUsd = 0;
  for (const s of sales) {
    salesByMethod[s.payment_method] = (salesByMethod[s.payment_method] || 0) + 1;
    salesTotalUsd += Number(s.total_ref) || 0;
  }
  const expByCat = {};
  let expTotalUsd = 0;
  for (const e of expenses) {
    expByCat[e.category] = (expByCat[e.category] || 0) + 1;
    expTotalUsd += Number(e.amount_ref) || 0;
  }

  console.log(`VENTAS: ${sales.length} rows | total USD ${salesTotalUsd.toFixed(2)}`);
  for (const [m, c] of Object.entries(salesByMethod)) console.log(`  ${m}: ${c} rows`);
  console.log(`\nEGRESOS: ${expenses.length} rows | total USD ${expTotalUsd.toFixed(2)}`);
  for (const [c, n] of Object.entries(expByCat)) console.log(`  ${c}: ${n} rows`);

  console.log('\nSample VENTAS:');
  console.log(JSON.stringify(sales.slice(0, 2), null, 2));
  console.log('\nSample EGRESOS:');
  console.log(JSON.stringify(expenses.slice(0, 2), null, 2));

  if (DRY) {
    console.log('\n[DRY RUN] no se insertó nada. Re-correr sin --dry-run para importar.');
    return;
  }

  console.log('\nInsertando...');
  await insertBatch('cantina_sales', sales);
  await insertBatch('cantina_expenses', expenses);
  console.log('\n✓ Import completado.');
})().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
