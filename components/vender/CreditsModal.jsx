"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, PAYMENT_METHODS } from "@/lib/utils";
import ClientLink from "@/components/shared/ClientLink";

export default function CreditsModal({ user, rate, onClose, onUpdated }) {
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingCredit, setPayingCredit] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadCredits = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("cantina_credits")
      .select("*")
      .in("status", ["pending", "partial"])
      .order("created_at", { ascending: true });
    if (data) setCredits(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadCredits(); }, [loadCredits]);

  const daysSince = (dateStr) => {
    const created = new Date(dateStr);
    const now = new Date();
    return Math.floor((now - created) / (1000 * 60 * 60 * 24));
  };

  const ageColor = (days) => {
    if (days < 3) return "text-green-600";
    if (days <= 7) return "text-yellow-600";
    return "text-red-600";
  };

  const ageBg = (days) => {
    if (days < 3) return "bg-green-50";
    if (days <= 7) return "bg-yellow-50";
    return "bg-red-50";
  };

  const openPay = (credit) => {
    const outstanding = Number(credit.original_amount_ref) - Number(credit.paid_amount_ref || 0);
    setPayingCredit(credit);
    setPayAmount(outstanding.toFixed(2));
    setPayMethod("");
    setPayRef("");
  };

  const confirmPayment = async () => {
    if (!payingCredit || !payMethod || !payAmount) return;

    const amount = parseFloat(payAmount);
    const outstanding = Number(payingCredit.original_amount_ref) - Number(payingCredit.paid_amount_ref || 0);

    if (amount <= 0 || amount > outstanding) {
      alert(`El monto debe ser entre 0.01 y ${outstanding.toFixed(2)} REF`);
      return;
    }

    setProcessing(true);

    try {
      // 1. Insert payment
      const { error: payErr } = await supabase.from("cantina_credit_payments").insert({
        credit_id: payingCredit.id,
        amount_ref: amount,
        amount_bs: rate?.eur ? amount * rate.eur : null,
        payment_method: payMethod,
        reference: payRef || null,
        exchange_rate_bs: rate?.eur || null,
        notes: null,
        created_by: user?.name || "Cantina",
      });
      if (payErr) throw payErr;

      // 2. Update credit
      const newPaid = Number(payingCredit.paid_amount_ref || 0) + amount;
      const newStatus = newPaid >= Number(payingCredit.original_amount_ref) ? "paid" : "partial";
      const { error: upErr } = await supabase
        .from("cantina_credits")
        .update({ paid_amount_ref: newPaid, status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", payingCredit.id);
      if (upErr) throw upErr;

      setPayingCredit(null);
      await loadCredits();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert("Error registrando pago: " + err.message);
    }
    setProcessing(false);
  };

  const selectedPayMethod = PAYMENT_METHODS.find((m) => m.id === payMethod);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <AlertCircle size={16} className="text-brand" /> Creditos pendientes
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-200 rounded"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-stone-400 animate-pulse text-center py-8">Cargando...</p>
          ) : credits.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No hay creditos pendientes</p>
          ) : payingCredit ? (
            /* Payment form */
            <div className="space-y-4">
              <button onClick={() => setPayingCredit(null)} className="text-xs text-brand hover:underline">&larr; Volver a la lista</button>
              <div className="bg-stone-50 rounded-lg p-3">
                <p className="font-medium text-sm">{payingCredit.client_name}</p>
                <p className="text-xs text-stone-500 mt-1">
                  Original: REF {Number(payingCredit.original_amount_ref).toFixed(2)} ·
                  Pagado: REF {Number(payingCredit.paid_amount_ref || 0).toFixed(2)} ·
                  Pendiente: REF {(Number(payingCredit.original_amount_ref) - Number(payingCredit.paid_amount_ref || 0)).toFixed(2)}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1">Monto a pagar (REF)</label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-stone-500 block mb-1.5">Metodo de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setPayMethod(m.id); setPayRef(""); }}
                      className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        payMethod === m.id
                          ? "border-brand bg-brand/5 text-brand"
                          : "border-stone-200 text-stone-600 hover:border-stone-300"
                      }`}
                    >
                      <span>{m.icon}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedPayMethod?.needsRef && (
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1">Referencia</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="Numero de referencia"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={confirmPayment}
                disabled={processing || !payMethod || !payAmount}
                className="w-full py-3 rounded-xl bg-brand text-white font-bold text-sm disabled:opacity-30 hover:bg-brand-dark transition-all flex items-center justify-center gap-2"
              >
                {processing ? <><Loader2 size={16} className="animate-spin" /> Procesando...</> : "Confirmar Pago"}
              </button>
            </div>
          ) : (
            /* Credits list */
            <div className="space-y-2">
              {credits.map((c) => {
                const outstanding = Number(c.original_amount_ref) - Number(c.paid_amount_ref || 0);
                const days = daysSince(c.created_at);
                return (
                  <div key={c.id} className={`${ageBg(days)} rounded-lg p-3 flex items-center justify-between`}>
                    <div>
                      <p className="text-sm font-medium text-stone-800">
                        <ClientLink clientId={c.client_id} name={c.client_name} />
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Original: REF {Number(c.original_amount_ref).toFixed(2)}
                        {Number(c.paid_amount_ref || 0) > 0 && ` · Pagado: REF ${Number(c.paid_amount_ref).toFixed(2)}`}
                      </p>
                      <p className={`text-xs mt-0.5 ${ageColor(days)}`}>
                        {days === 0 ? "Hoy" : days === 1 ? "Ayer" : `Hace ${days} dias`}
                        {c.status === "partial" && " · Pago parcial"}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="text-sm font-bold text-brand">REF {outstanding.toFixed(2)}</p>
                        <p className="text-[10px] text-stone-400">pendiente</p>
                      </div>
                      <button
                        onClick={() => openPay(c)}
                        className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark transition-colors"
                      >
                        Cobrar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
