"use client";
import { useState, useEffect } from "react";
import { CheckCircle, RotateCcw } from "lucide-react";
import { formatBs, METHOD_LABELS } from "@/lib/utils";

const VOID_WINDOW_MS = 5 * 60 * 1000;

export default function SuccessScreen({ sale, todayStats, onNewSale, onVoidSale, canVoid, saleTimestamp }) {
  // Countdown del tiempo restante para anular
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!canVoid || !saleTimestamp) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [canVoid, saleTimestamp]);

  const remainingMs = saleTimestamp ? Math.max(0, VOID_WINDOW_MS - (now - saleTimestamp)) : 0;
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const voidStillActive = canVoid && remainingMs > 0;

  return (
    <div className="fixed inset-0 bg-brand-cream-light z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full text-center">
        <CheckCircle size={56} className="text-green-500 mx-auto mb-4" strokeWidth={1.5} />

        <h2 className="text-xl font-bold text-stone-800 mb-1">
          {sale.paymentMethod === "credit" ? "Credito registrado!" : "Venta registrada!"}
        </h2>
        <p className="text-sm text-stone-400 mb-5">
          {sale.paymentMethod === "credit"
            ? `Credito para ${sale.creditClientName}`
            : "Stock actualizado automaticamente"}
        </p>

        <div className="bg-stone-50 rounded-xl p-4 mb-4 text-left">
          <div className="space-y-1 mb-3">
            {sale.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-stone-600">{item.qty}x {item.name}</span>
                <span className="font-medium">REF {(item.price_ref * item.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-200 pt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-sm text-stone-500">Total</span>
              <span className="font-bold text-brand">REF {sale.totalRef.toFixed(2)}</span>
            </div>
            {sale.rate != null && sale.rate > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-stone-500"></span>
                <span className="text-sm text-stone-400">
                  {formatBs(sale.totalRef, sale.rate)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-stone-500">Metodo</span>
              <span className="text-sm font-medium">{METHOD_LABELS[sale.paymentMethod] || sale.paymentMethod}</span>
            </div>
          </div>
        </div>

        {todayStats.count > 1 && (
          <div className="bg-brand/5 rounded-xl p-3 mb-4">
            <p className="text-xs text-brand font-medium">
              Total del dia: REF {todayStats.total.toFixed(2)} en {todayStats.count} ventas
            </p>
          </div>
        )}

        <button
          onClick={onNewSale}
          className="w-full py-4 rounded-xl bg-brand text-white font-bold text-base hover:bg-brand-dark active:scale-[0.98] transition-all"
        >
          Nueva Venta
        </button>

        {voidStillActive && onVoidSale && (
          <button
            onClick={onVoidSale}
            className="w-full mt-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw size={14} /> Anular esta venta — {remainingMin}:{String(remainingSec).padStart(2, '0')}
          </button>
        )}
      </div>
    </div>
  );
}
