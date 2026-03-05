"use client";
import { CheckCircle } from "lucide-react";
import { formatBs, METHOD_LABELS } from "@/lib/utils";

export default function SuccessScreen({ sale, todayStats, onNewSale }) {
  return (
    <div className="fixed inset-0 bg-brand-cream-light z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full text-center">
        <CheckCircle size={56} className="text-green-500 mx-auto mb-4" strokeWidth={1.5} />

        <h2 className="text-xl font-bold text-stone-800 mb-1">¡Venta registrada!</h2>
        <p className="text-sm text-stone-400 mb-5">Stock actualizado automáticamente</p>

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
            {sale.totalBs != null && (
              <div className="flex justify-between">
                <span className="text-sm text-stone-500"></span>
                <span className="text-sm text-stone-400">
                  {formatBs(sale.totalRef, sale.totalBs / sale.totalRef)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-stone-500">Método</span>
              <span className="text-sm font-medium">{METHOD_LABELS[sale.paymentMethod] || sale.paymentMethod}</span>
            </div>
          </div>
        </div>

        {todayStats.count > 1 && (
          <div className="bg-brand/5 rounded-xl p-3 mb-4">
            <p className="text-xs text-brand font-medium">
              Total del día: REF {todayStats.total.toFixed(2)} en {todayStats.count} ventas
            </p>
          </div>
        )}

        <button
          onClick={onNewSale}
          className="w-full py-4 rounded-xl bg-brand text-white font-bold text-base hover:bg-brand-dark active:scale-[0.98] transition-all"
        >
          Nueva Venta
        </button>
      </div>
    </div>
  );
}
