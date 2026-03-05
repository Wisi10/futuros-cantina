"use client";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { formatBs, PAYMENT_METHODS } from "@/lib/utils";

export default function PaymentModal({ cart, rate, processing, onConfirm, onBack }) {
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");

  const totalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const hasTasa = !!rate;

  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === method);
  const canConfirm = method && !processing && (!selectedMethod?.needsRef || reference.trim());

  return (
    <div className="fixed inset-0 bg-brand-cream-light z-40 flex flex-col">
      <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} disabled={processing} className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-30">
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-bold text-lg text-stone-800">Método de pago</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 max-w-lg mx-auto w-full">
        {/* Order summary */}
        <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
          <p className="text-xs text-stone-500 font-medium mb-2">Resumen de venta</p>
          <div className="space-y-1 mb-3">
            {cart.map((item) => (
              <div key={item.product.id} className="flex justify-between text-sm">
                <span className="text-stone-600">
                  {item.product.emoji || "🍽️"} {item.qty}x {item.product.name}
                </span>
                <span className="font-medium">REF {(Number(item.product.price_ref) * item.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-100 pt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-stone-500">Total</span>
              <span className="text-2xl font-bold text-brand">REF {totalRef.toFixed(2)}</span>
            </div>
            {hasTasa && (
              <p className="text-right text-sm text-stone-400">{formatBs(totalRef, rate.eur)}</p>
            )}
          </div>
        </div>

        {/* Payment methods */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {PAYMENT_METHODS.map((m) => {
            const active = method === m.id;
            return (
              <button
                key={m.id}
                onClick={() => { setMethod(m.id); setReference(""); }}
                disabled={processing}
                className={`flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 font-medium text-sm transition-all active:scale-[0.97] ${
                  active
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                }`}
              >
                <span className="text-2xl">{m.icon}</span>
                {m.label}
              </button>
            );
          })}
          {/* Credit - disabled for now */}
          <button
            disabled
            className="flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-stone-200 text-stone-300 text-sm col-span-2"
          >
            <span className="text-2xl">📋</span>
            Crédito — próximamente
          </button>
        </div>

        {/* Reference field */}
        {selectedMethod?.needsRef && (
          <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
            <label className="text-xs font-medium text-stone-500 block mb-1.5">
              Referencia ({selectedMethod.label})
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Número de referencia"
              className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="bg-white border-t border-stone-200 p-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => onConfirm(method, reference)}
            disabled={!canConfirm}
            className="w-full py-4 rounded-xl bg-brand text-white font-bold text-base disabled:opacity-30 hover:bg-brand-dark active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {processing ? (
              <><Loader2 size={18} className="animate-spin" /> Procesando...</>
            ) : (
              "Confirmar Venta"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
