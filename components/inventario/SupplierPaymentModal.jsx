"use client";
import { useState, useMemo, useEffect } from "react";
import { X, DollarSign, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PAYMENT_METHODS = [
  { id: "transferencia", label: "Transferencia" },
  { id: "pago_movil", label: "Pago Móvil" },
  { id: "efectivo_usd", label: "Efectivo USD" },
  { id: "efectivo_bs", label: "Efectivo Bs" },
  { id: "zelle", label: "Zelle" },
  { id: "datafono", label: "Datáfono" },
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysUntil(dueDate) {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

// Categoría del expense derivada de los items (igual lógica que RestockForm).
function deriveExpenseCategory(items) {
  if (!items || items.length === 0) return "Insumos cantina · Otros";
  const cats = new Set();
  for (const it of items) {
    const n = (it.name || "").toLowerCase();
    if (n.match(/coca|pepsi|refresco|jugo|agua|gatorade|cerveza|bebida/)) cats.add("Insumos cantina · Bebida");
    else if (n.match(/pan|hamburguesa|perro|empanada|pollo|carne|salchicha|tequeño|nugget|papa|comida/)) cats.add("Insumos cantina · Comida");
    else if (n.match(/snack|chip|flips|pepito|samba|malta|chocolate|cri-cri|donas|galleta|chupeta|caramelo/)) cats.add("Insumos cantina · Snacks");
    else if (n.match(/vaso|bolsa|servilleta|pitillo|empaque|porta|aluminio|papel/)) cats.add("Insumos cantina · Empaques");
    else if (n.match(/lavaplato|esponja|jabon|limpieza|cloro|detergente|atomizador/)) cats.add("Insumos cantina · Limpieza");
  }
  if (cats.size === 1) return [...cats][0];
  return "Insumos cantina · Otros";
}

// Modal de pago simplificado: el usuario ingresa UN monto total + método y el sistema
// distribuye automáticamente entre las facturas (las más vencidas primero / FIFO).
// El usuario NO toca montos por factura — sólo el total y los detalles del pago.
export default function SupplierPaymentModal({ supplier, restocks, rate, user, onClose, onPaid }) {
  // Ordenar restocks: vencidas primero, después por due_date ascendente, después por restock_date.
  const sortedRestocks = useMemo(() => {
    return [...restocks].sort((a, b) => {
      const aDue = a.due_date ? daysUntil(a.due_date) : 999;
      const bDue = b.due_date ? daysUntil(b.due_date) : 999;
      if (aDue !== bDue) return aDue - bDue;
      return (a.restock_date || "").localeCompare(b.restock_date || "");
    });
  }, [restocks]);

  const totalDebt = useMemo(
    () => sortedRestocks.reduce((s, r) => s + Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0)), 0),
    [sortedRestocks]
  );

  const [amount, setAmount] = useState(totalDebt.toFixed(2));
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [rateInput, setRateInput] = useState(rate?.usd ? Number(rate.usd).toFixed(4) : "");
  const [bcvRate, setBcvRate] = useState(rate?.usd ? Number(rate.usd) : null); // tasa "oficial" pre-cargada para detectar override
  const [bcvFetched, setBcvFetched] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Fetch tasa BCV del día (microservicio). Si falla, queda la tasa del sistema.
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch("https://futuros-bcv.vercel.app/api/rates", { signal: AbortSignal.timeout(4000) });
        const json = await res.json();
        if (aborted) return;
        if (json?.success && json?.data?.usd_bs > 0) {
          const bcv = Number(json.data.usd_bs);
          setBcvRate(bcv);
          setBcvFetched(true);
          // Solo override el input si no fue tocado manualmente todavía
          setRateInput((prev) => prev === (rate?.usd ? Number(rate.usd).toFixed(4) : "") ? bcv.toFixed(4) : prev);
        }
      } catch (_) { /* fallback silencioso a tasa del sistema */ }
    })();
    return () => { aborted = true; };
  }, [rate?.usd]);

  const amountNum = Math.max(0, parseFloat(amount) || 0);
  const rateNum = Math.max(0, parseFloat(rateInput) || 0);
  // La tasa siempre se guarda (aunque el método sea USD-only), para auditoría posterior.
  const amountBs = rateNum > 0 ? amountNum * rateNum : null;
  // Override = tasa editada distinta de BCV cargada
  const isRateOverridden = bcvRate != null && rateNum > 0 && Math.abs(rateNum - bcvRate) > 0.0001;
  const isFullPayment = amountNum >= totalDebt - 0.005;
  const exceedsDebt = amountNum > totalDebt + 0.005;

  // Distribución previsualizada FIFO (vencidas primero).
  const allocation = useMemo(() => {
    let remaining = amountNum;
    const result = [];
    for (const r of sortedRestocks) {
      const outstanding = Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0));
      const toPay = Math.min(remaining, outstanding);
      if (toPay > 0) {
        result.push({ restock: r, amount: toPay, fullPayoff: toPay >= outstanding - 0.005 });
        remaining -= toPay;
      }
      if (remaining <= 0.005) break;
    }
    return result;
  }, [sortedRestocks, amountNum]);

  const canSubmit = amountNum > 0 && !exceedsDebt && rateNum > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");

    try {
      // 1. Insert pagos por factura — siempre guardamos la tasa para auditoría
      const paymentInserts = allocation.map((a) => ({
        restock_id: a.restock.id,
        amount_ref: a.amount,
        amount_bs: rateNum > 0 ? a.amount * rateNum : null,
        payment_method: method,
        reference: reference.trim() || null,
        exchange_rate_bs: rateNum > 0 ? rateNum : null,
        paid_at: paidAt,
        notes: notes.trim()
          ? `${notes.trim()}${allocation.length > 1 ? ` (pago a ${supplier} · ${allocation.length} facturas)` : ""}`
          : (allocation.length > 1 ? `Pago a ${supplier} · ${allocation.length} facturas` : null),
        created_by: user?.name || "Cantina",
      }));

      const { error: payErr } = await supabase.from("cantina_restock_payments").insert(paymentInserts);
      if (payErr) throw payErr;

      // 2. Update restocks
      for (const a of allocation) {
        const newPaid = Number(a.restock.paid_amount_ref || 0) + a.amount;
        const total = Number(a.restock.total_cost_ref || 0);
        const status = newPaid >= total - 0.005 ? "paid" : "partial";
        const { error: upErr } = await supabase
          .from("cantina_restocks")
          .update({ paid_amount_ref: newPaid, payment_status: status })
          .eq("id", a.restock.id);
        if (upErr) throw upErr;
      }

      // 3. Crear 1 expense por el monto total
      const allItems = allocation.flatMap((a) => Array.isArray(a.restock.items) ? a.restock.items : []);
      const expenseCategory = deriveExpenseCategory(allItems);
      try {
        await supabase.from("expenses").insert({
          id: "exp_" + Math.random().toString(36).slice(2, 12),
          expense_type: "variable",
          category: expenseCategory,
          name: `Pago a ${supplier}${allocation.length > 1 ? ` (${allocation.length} facturas)` : ""}`,
          amount_usd: amountNum,
          amount_bs: amountBs,
          exchange_rate: rateNum > 0 ? rateNum : null,
          payment_method: method,
          reference: reference.trim() || null,
          provider: supplier,
          expense_date: paidAt,
          created_by: user?.name || "Cantina",
          notes: `Pago a ${supplier} · facturas: ${allocation.map((a) => a.restock.id).join(", ")}${notes ? ` · ${notes}` : ""}`,
        });
      } catch (linkErr) {
        console.error("[SUPPLIER_PAYMENT→GASTO]", linkErr);
      }

      if (onPaid) onPaid();
    } catch (e) {
      console.error("SupplierPaymentModal:", e);
      setError(e.message || "Error guardando el pago");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div className="min-w-0">
            <div className="text-xs text-stone-500 mb-1">Pagar a proveedor</div>
            <div className="text-lg font-bold text-stone-800 truncate">{supplier}</div>
            <div className="text-xs text-stone-500 mt-0.5">
              Deuda total: <span className="font-bold text-brand">${totalDebt.toFixed(2)}</span>
              <span className="ml-2">· {sortedRestocks.length} factura{sortedRestocks.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Monto */}
          <div>
            <label className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Monto a pagar (USD)</label>
            <div className="mt-1 flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={totalDebt.toFixed(2)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 border border-stone-300 rounded-lg text-base font-medium focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              </div>
              <button
                onClick={() => setAmount(totalDebt.toFixed(2))}
                className="px-3 py-2.5 text-xs font-semibold text-brand hover:bg-brand/5 rounded-lg border border-stone-200"
              >
                Pagar todo
              </button>
            </div>
            {exceedsDebt && (
              <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> El monto supera la deuda total
              </div>
            )}
          </div>

          {/* Método */}
          <div>
            <label className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Método de pago</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Tasa BCV — siempre visible, pre-cargada con BCV del día, editable con warning */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-stone-500 font-semibold">
                Tasa Bs/USD
                {bcvFetched && <span className="ml-1 normal-case text-stone-400">(BCV del día)</span>}
              </label>
              {isRateOverridden && (
                <button
                  type="button"
                  onClick={() => bcvRate && setRateInput(bcvRate.toFixed(4))}
                  className="text-[10px] text-brand hover:underline"
                >
                  Restaurar a BCV
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.0001"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder="Ej. 567.6800"
              className={`mt-1 w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand ${isRateOverridden ? "border-amber-400 bg-amber-50" : "border-stone-300"}`}
            />
            {isRateOverridden && (
              <div className="text-[11px] text-amber-700 mt-1 flex items-start gap-1">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                <span>
                  Tasa editada manualmente · BCV de hoy: <strong>{bcvRate.toFixed(4)}</strong>. Confirmá que es lo que querés.
                </span>
              </div>
            )}
            {amountBs != null && (
              <div className="text-xs text-stone-500 mt-1">
                Pago: ${amountNum.toFixed(2)} = Bs {amountBs.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>

          {/* Referencia */}
          <div>
            <label className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Referencia <span className="text-stone-400 normal-case">(opcional)</span></label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nº transferencia o ref"
              className="mt-1 w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Fecha del pago</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Notas <span className="text-stone-400 normal-case">(opcional)</span></label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cualquier detalle del pago"
              className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
            />
          </div>

          {/* Preview de distribución */}
          {amountNum > 0 && allocation.length > 0 && (
            <div className="bg-stone-50 rounded-lg p-3 text-xs">
              <div className="font-semibold text-stone-600 mb-1.5">
                {isFullPayment ? "Salda completa la deuda" : `Se descontará así (vencidas primero):`}
              </div>
              {!isFullPayment && (
                <div className="space-y-1">
                  {allocation.slice(0, 4).map((a) => (
                    <div key={a.restock.id} className="flex items-center justify-between text-stone-600">
                      <span>{a.restock.restock_date} {a.restock.due_date && `· vence ${a.restock.due_date}`}</span>
                      <span className={a.fullPayoff ? "text-green-700 font-semibold" : "text-violet-700 font-semibold"}>
                        ${a.amount.toFixed(2)} {a.fullPayoff ? "(salda)" : "(parcial)"}
                      </span>
                    </div>
                  ))}
                  {allocation.length > 4 && (
                    <div className="text-stone-400 italic">… y {allocation.length - 4} factura{allocation.length - 4 !== 1 ? "s" : ""} más</div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-1">
              <AlertTriangle size={12} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2.5 bg-brand text-white hover:bg-brand-dark rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
            Confirmar pago ${amountNum.toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  );
}
