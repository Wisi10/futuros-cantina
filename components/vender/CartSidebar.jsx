"use client";
import { useState, useEffect, useCallback } from "react";
import { Minus, Plus, Trash2, ShoppingCart, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBs, ProductImage } from "@/lib/utils";

export default function CartSidebar({ cart, rate, onUpdateQty, onRemove, onCheckout, saleClient, onAddRedemption }) {
  const totalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const hasTasa = !!rate;
  const [showRewards, setShowRewards] = useState(false);
  const [rewards, setRewards] = useState([]);
  const [loadingRewards, setLoadingRewards] = useState(false);

  const loadRewards = useCallback(async () => {
    if (!saleClient?.id || !supabase) return;
    setLoadingRewards(true);
    try {
      const { data } = await supabase.rpc("get_redeemable_products", { client_id_param: saleClient.id });
      setRewards(data || []);
    } catch { setRewards([]); }
    setLoadingRewards(false);
  }, [saleClient?.id]);

  useEffect(() => { if (showRewards) loadRewards(); }, [showRewards, loadRewards]);

  const handleSelectReward = (product) => {
    onAddRedemption(product);
    setShowRewards(false);
  };

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
        {saleClient && (
          <p className="text-[10px] text-gold mt-1 font-medium">
            👤 {saleClient.name} · {(saleClient.points || 0).toLocaleString()} pts
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center py-8 text-stone-300">
            <ShoppingCart size={32} className="mx-auto mb-2" />
            <p className="text-xs">Agrega productos</p>
          </div>
        ) : (
          cart.map((item) => {
            const isRedemption = !!item.isRedemption;
            const subtotalRef = isRedemption ? 0 : Number(item.product.price_ref) * item.qty;

            return (
              <div key={item.product.id + (isRedemption ? "_rdm" : "")} className={`rounded-lg p-2.5 ${isRedemption ? "bg-gold/5 border border-gold/20" : "bg-stone-50"}`}>
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 flex-1 pr-1">
                    <ProductImage product={item.product} size={20} />
                    <div>
                      <p className="text-xs font-medium text-stone-700 leading-tight">{item.product.name}</p>
                      {isRedemption && <span className="text-[9px] text-gold font-medium">🎁 GRATIS (canje)</span>}
                    </div>
                  </div>
                  <button onClick={() => onRemove(item.product.id, isRedemption)} className="p-1 text-stone-300 hover:text-red-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>

                {!isRedemption && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onUpdateQty(item.product.id, -1)}
                        className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center active:bg-stone-200">
                        <Minus size={12} />
                      </button>
                      <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                      <button onClick={() => onUpdateQty(item.product.id, 1)}
                        disabled={item.qty >= (item.product.stock_quantity ?? 0)}
                        className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center active:bg-stone-200 disabled:opacity-30">
                        <Plus size={12} />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-brand">REF {subtotalRef.toFixed(2)}</p>
                      {hasTasa && <p className="text-[10px] text-stone-400">{formatBs(subtotalRef, rate.eur)}</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-stone-200 p-4 space-y-3">
        {/* Redeem button */}
        {saleClient && (saleClient.points || 0) > 0 && onAddRedemption && (
          <button onClick={() => setShowRewards(!showRewards)}
            className="w-full py-2 rounded-lg border-2 border-gold text-gold text-xs font-medium hover:bg-gold/5 transition-colors flex items-center justify-center gap-1.5">
            <Gift size={14} /> Canjear premio ({(saleClient.points || 0).toLocaleString()} pts)
          </button>
        )}

        <div>
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-stone-500">Total</span>
            <span className="text-xl font-bold text-brand">REF {totalRef.toFixed(2)}</span>
          </div>
          {hasTasa && <p className="text-right text-xs text-stone-400">{formatBs(totalRef, rate.eur)}</p>}
        </div>
        <button onClick={onCheckout} disabled={cart.length === 0}
          className="w-full py-3 rounded-xl bg-brand text-white font-bold text-sm disabled:opacity-30 hover:bg-brand-dark active:scale-[0.98] transition-all">
          Cobrar →
        </button>
      </div>

      {/* Rewards dropdown */}
      {showRewards && (
        <div className="absolute bottom-40 left-0 right-0 mx-3 bg-white border border-stone-200 rounded-xl shadow-lg max-h-60 overflow-y-auto z-10">
          <div className="p-2">
            {loadingRewards ? (
              <p className="text-xs text-stone-400 animate-pulse text-center py-4">Cargando premios...</p>
            ) : rewards.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">Sin premios disponibles</p>
            ) : (
              rewards.map(r => (
                <button key={r.id} onClick={() => handleSelectReward(r)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-stone-50 transition-colors text-left">
                  <ProductImage product={r} size={28} className="rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-800 truncate">{r.name}</p>
                    <p className="text-[10px] text-gold">{r.redemption_cost_points} pts</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
