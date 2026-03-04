"use client";
import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";

export default function Cart({ cart, rate, onUpdateQty, onRemove, onCheckout }) {
  const totalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const totalBs = rate ? totalRef * rate.eur : null;

  return (
    <div className="w-[280px] bg-white border-l border-stone-200 flex flex-col h-full shrink-0">
      <div className="px-4 py-3 border-b border-stone-200">
        <h2 className="font-bold text-sm text-stone-700 flex items-center gap-2">
          <ShoppingCart size={16} />
          Orden actual
          {cart.length > 0 && (
            <span className="ml-auto bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">
              {cart.reduce((s, i) => s + i.qty, 0)}
            </span>
          )}
        </h2>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center py-8 text-stone-300">
            <ShoppingCart size={32} className="mx-auto mb-2" />
            <p className="text-xs">Agrega productos</p>
          </div>
        ) : (
          cart.map((item) => {
            const subtotalRef = Number(item.product.price_ref) * item.qty;
            const subtotalBs = rate ? subtotalRef * rate.eur : null;

            return (
              <div key={item.product.id} className="bg-stone-50 rounded-lg p-2.5">
                <div className="flex items-start justify-between mb-1.5">
                  <p className="text-xs font-medium text-stone-700 leading-tight flex-1 pr-1">
                    {item.product.name}
                  </p>
                  <button
                    onClick={() => onRemove(item.product.id)}
                    className="p-1 text-stone-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onUpdateQty(item.product.id, -1)}
                      className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center active:bg-stone-200"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                    <button
                      onClick={() => onUpdateQty(item.product.id, 1)}
                      disabled={item.qty >= item.product.stock_quantity}
                      className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center active:bg-stone-200 disabled:opacity-30"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-brand">REF {subtotalRef.toFixed(2)}</p>
                    {subtotalBs != null && (
                      <p className="text-[10px] text-stone-400">
                        Bs {subtotalBs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Totals & Checkout */}
      <div className="border-t border-stone-200 p-4 space-y-3">
        <div>
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-stone-500">Total</span>
            <span className="text-xl font-bold text-brand">REF {totalRef.toFixed(2)}</span>
          </div>
          {totalBs != null && (
            <p className="text-right text-xs text-stone-400">
              Bs {totalBs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>

        <button
          onClick={onCheckout}
          disabled={cart.length === 0}
          className="w-full py-3 rounded-xl bg-brand text-white font-bold text-sm disabled:opacity-30 hover:bg-brand-dark active:scale-[0.98] transition-all"
        >
          Cobrar →
        </button>
      </div>
    </div>
  );
}
