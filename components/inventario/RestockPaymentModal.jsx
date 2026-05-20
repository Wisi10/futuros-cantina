"use client";
import { useState, useMemo } from "react";
import { X, DollarSign, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Modal para registrar pago contra un restock pendiente (lado proveedor).
// Mismo pattern canónico que cantina_credits/cantina_credit_payments del
// lado cliente: deuda en $REF locked + tabla pagos 1:N.

const PAYMENT_METHODS = [
  { id: "transferencia", label: "Transferencia" },
  { id: "pago_movil", label: "Pago Móvil" },
  { id: "zelle", label: "Zelle" },
  { id: "cash_usd", label: "Efectivo USD" },
  { id: "cash_bs", label: "Efectivo Bs" },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function RestockPaymentModal({ restock, payments = [], rate, user, onClose, onPaid }) {
  const total = Number(restock.total_cost_ref || 0);
  const alreadyPaid = Number(restock.paid_amount_ref || 0);
  const outstanding = Math.max(0, total - alreadyPaid);

  // Tasa default: la del día (de exchange_rates via rate prop). Editable por staff
  // (el usuario pidió esto explicitamente — la tasa puede no ser la del dia
  // si el pago se hizo otro día).
  const todaysRate = rate?.usd || rate?.eur || "";

  const [amount, setAmount] = useState(String(outstanding.toFixed(2)));
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [exchangeRate, setExchangeRate] = useState(String(todaysRate || ""));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const amountNum = parseFloat(amount) || 0;
  const usesRate = method === "pago_movil" || method === "cash_bs" || method === "transferencia";
  const rateNum = parseFloat(exchangeRate) || 0;
  const amountBs = usesRate && rateNum > 0 ? amountNum * rateNum : null;

  const isFullPayment = amountNum >= outstanding - 0.005;
  const newStatus = isFullPayment ? "paid" : amountNum > 0 ? "partial" : restock.payment_status;

  const canSubmit = amountNum > 0 && amountNum <= outstanding + 0.01 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");

    try {
      // 1. Insert payment
      const { error: payErr } = await supabase.from("cantina_restock_payments").insert({
        restock_id: restock.id,
        amount_ref: amountNum,
        amount_bs: amountBs,
        payment_method: method,
        reference: reference.trim() || null,
        exchange_rate_bs: usesRate && rateNum > 0 ? rateNum : null,
        paid_at: paidAt,
        notes: notes.trim() || null,
        created_by: user?.name || "Cantina",
      });
      if (payErr) throw payErr;

      // 2. Update restock
      const newPaid = alreadyPaid + amountNum;
      const { error: upErr } = await supabase
        .from("cantina_restocks")
        .update({ paid_amount_ref: newPaid, payment_status: newStatus })
        .eq("id", restock.id);
      if (upErr) throw upErr;

      if (onPaid) onPaid();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-brand" />
            <h2 className="font-bold text-stone-800">Registrar pago a proveedor</h2>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1 hover:bg-stone-100 rounded disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Restock summary */}
          <div className="bg-stone-50 rounded-xl p-3">
            <div className="text-xs text-stone-500 uppercase tracking-wider font-medium">Factura</div>
            <div className="font-bold text-stone-800 mt-0.5">{restock.supplier || "Sin proveedor"}</div>
            <div className="text-xs text-stone-500 mt-0.5">{restock.notes || ""}</div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
              <div>
                <div className="text-[11px] text-stone-500">Total</div>
                <div className="font-bold text-stone-800">${total.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[11px] text-stone-500">Pagado</div>
                <div className="font-bold text-violet-700">${alreadyPaid.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[11px] text-stone-500">Pendiente</div>
                <div className="font-bold text-amber-700">${outstanding.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Monto a pagar ($REF)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
              <button
                onClick={() => setAmount(String(outstanding.toFixed(2)))}
                className="px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs"
                title="Pagar todo lo pendiente"
              >
                Todo
              </button>
            </div>
            {amountNum > outstanding + 0.01 && (
              <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> El monto excede lo pendiente
              </div>
            )}
          </div>

          {/* Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Método de pago</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm focus:border-brand focus:outline-none"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Referencia (opcional)</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Nº ref"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Fecha del pago</label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            {usesRate && (
              <div>
                <label className="text-xs text-stone-500 mb-1 block">
                  Tasa Bs/USD del día
                  <span className="text-[10px] text-stone-400 ml-1">(editable)</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Bs preview */}
          {amountBs != null && (
            <div className="text-sm text-stone-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              Pago: <strong>${amountNum.toFixed(2)}</strong> = <strong>Bs {amountBs.toLocaleString("es-VE", { maximumFractionDigits: 2 })}</strong> a tasa {rateNum.toFixed(4)}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Notas (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cualquier detalle del pago"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          {/* Status preview */}
          <div className="text-xs text-stone-500 flex items-center gap-1">
            <CheckCircle2 size={12} />
            Después de este pago: <strong className={isFullPayment ? "text-green-700" : "text-violet-700"}>
              {isFullPayment ? "Pagada completa" : "Parcial"}
            </strong>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded-lg text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-5 py-2 bg-brand text-white hover:bg-brand-dark rounded-lg text-sm font-bold disabled:opacity-40 flex items-center gap-1.5"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><DollarSign size={14} /> Confirmar pago</>}
          </button>
        </div>
      </div>
    </div>
  );
}
