"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs, calcBs } from "@/lib/utils";

const METHODS = [
  { id: "transferencia", label: "Transferencia" },
  { id: "pago_movil", label: "Pago Movil" },
  { id: "cash_bs", label: "Efectivo Bs" },
  { id: "cash_usd", label: "Cash USD" },
  { id: "zelle", label: "Zelle" },
];

export default function RegisterIntercompanyPaymentModal({
  event,
  owedRef,
  paidRef,
  rate,
  user,
  onClose,
  onRegistered,
}) {
  const remaining = Math.max(Number(owedRef || 0) - Number(paidRef || 0), 0);
  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : "0");
  const [paymentMethod, setPaymentMethod] = useState("transferencia");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const amountNum = parseFloat(amount) || 0;
  const amountBsPreview = calcBs(amountNum, rate?.eur);
  const wouldBeSettled = paidRef + amountNum >= owedRef && owedRef > 0;

  async function handleSubmit() {
    if (submitting) return;
    if (amountNum <= 0) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (amountNum > remaining + 0.01) {
      const ok = window.confirm(
        `El monto (${formatREF(amountNum)}) excede el saldo pendiente (${formatREF(remaining)}). Continuar?`
      );
      if (!ok) return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("register_event_payment", {
        p_event_id: event.id,
        p_amount_ref: amountNum,
        p_payment_method: paymentMethod,
        p_exchange_rate: rate?.eur || null,
        p_created_by: user?.name || "Cantina",
        p_notes: notes || null,
      });
      if (rpcErr) throw rpcErr;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.success) {
        throw new Error(result?.message || "Error registrando abono.");
      }
      await onRegistered();
    } catch (e) {
      setError(e.message || "Error inesperado.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div>
            <div className="text-xs text-stone-500 mb-0.5">Registrar abono a cantina</div>
            <div className="text-base font-bold text-stone-800">
              Saldo pendiente: {formatREF(remaining)}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-stone-50 rounded-lg p-2">
              <div className="text-stone-500">Costo total</div>
              <div className="font-semibold text-stone-800">{formatREF(owedRef)}</div>
            </div>
            <div className="bg-stone-50 rounded-lg p-2">
              <div className="text-stone-500">Pagado antes</div>
              <div className="font-semibold text-stone-800">{formatREF(paidRef)}</div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Monto REF</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-base font-medium text-stone-800 focus:outline-none focus:border-brand"
            />
            <div className="text-xs text-stone-500 mt-1">
              {amountBsPreview != null ? `Equivale a ${formatBs(amountNum, rate?.eur)}` : "Sin tasa de cambio cargada"}
              {wouldBeSettled && (
                <span className="ml-2 inline-block text-green-700 font-semibold">Saldara el evento</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Metodo de pago</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white"
            >
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand resize-none"
              placeholder="Referencia, banco, comentarios..."
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-stone-200 p-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-50"
          >
            {submitting ? "Procesando..." : "Confirmar abono"}
          </button>
        </div>
      </div>
    </div>
  );
}
