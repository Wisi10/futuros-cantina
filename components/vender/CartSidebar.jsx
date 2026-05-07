"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Minus, Plus, Trash2, ShoppingCart, Gift, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBs, ProductImage } from "@/lib/utils";

function CartContent({ cart, rate, onUpdateQty, onRemove, onCheckout, saleClient, onAddRedemption, totalRef }) {
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

  return (
    <>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center py-8 text-stone-300">
            <ShoppingCart size={32} className="mx-auto mb-2" />
            <p className="text-xs">Agrega productos</p>
          </div>
        ) : (
          cart.map((item) => {
            const isRedemption = !!item.isRedemption;
            const isFree       = isRedemption;
            const subtotalRef  = isFree ? 0 : Number(item.product.price_ref) * item.qty;
            const kind         = isRedemption ? "redemption" : "regular";
            const keySuffix    = isRedemption ? "_rdm" : "";
            return (
              <div key={item.product.id + keySuffix} className={`rounded-lg p-2.5 ${isFree ? "bg-gold/5 border border-gold/20" : "bg-stone-50"}`}>
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 flex-1 pr-1">
                    <ProductImage product={item.product} size={20} />
                    <div>
                      <p className="text-xs font-medium text-stone-700 leading-tight">{item.product.name}</p>
                      {isRedemption && <span className="text-[9px] text-gold font-medium">🎁 GRATIS (canje)</span>}
                    </div>
                  </div>
                  <button onClick={() => onRemove(item.product.id, kind)}
                    className="p-1.5 text-stone-300 hover:text-red-500 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center">
                    <Trash2 size={14} />
                  </button>
                </div>
                {!isFree && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onUpdateQty(item.product.id, -1)}
                        className="w-9 h-9 md:w-7 md:h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center active:bg-stone-200">
                        <Minus size={14} />
                      </button>
                      <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                      <button onClick={() => onUpdateQty(item.product.id, 1)}
                        disabled={item.qty >= (item.product.stock_quantity ?? 0)}
                        className="w-9 h-9 md:w-7 md:h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center active:bg-stone-200 disabled:opacity-30">
                        <Plus size={14} />
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
        {saleClient && (saleClient.points || 0) > 0 && onAddRedemption && (
          <div className="relative">
            <button onClick={() => setShowRewards(!showRewards)}
              className="w-full py-2 rounded-lg border-2 border-gold text-gold text-xs font-medium hover:bg-gold/5 transition-colors flex items-center justify-center gap-1.5">
              <Gift size={14} /> Canjear premio ({(saleClient.points || 0).toLocaleString()} pts)
            </button>
            {showRewards && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                <div className="p-2">
                  {loadingRewards ? (
                    <p className="text-xs text-stone-400 animate-pulse text-center py-4">Cargando...</p>
                  ) : rewards.length === 0 ? (
                    <p className="text-xs text-stone-400 text-center py-4">Sin premios disponibles</p>
                  ) : (
                    rewards.map(r => (
                      <button key={r.id} onClick={() => { onAddRedemption(r); setShowRewards(false); }}
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
    </>
  );
}

export default function CartSidebar({ cart, rate, onUpdateQty, onRemove, onCheckout, saleClient, onAddRedemption }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const totalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  // Body scroll lock when bottom sheet is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div className="hidden md:flex w-[280px] bg-white border-l border-stone-200 flex-col h-full shrink-0">
        <div className="px-4 py-3 border-b border-stone-200">
          <h2 className="font-bold text-sm text-stone-700 flex items-center gap-2">
            <ShoppingCart size={16} /> Orden actual
            {itemCount > 0 && <span className="ml-auto bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">{itemCount}</span>}
          </h2>
          {saleClient && <p className="text-[10px] text-gold mt-1 font-medium">👤 {saleClient.name} · {(saleClient.points || 0).toLocaleString()} pts</p>}
        </div>
        <CartContent cart={cart} rate={rate} onUpdateQty={onUpdateQty} onRemove={onRemove}
          onCheckout={onCheckout} saleClient={saleClient} onAddRedemption={onAddRedemption} totalRef={totalRef} />
      </div>

      {/* Mobile: FAB + bottom sheet */}
      <div className="md:hidden">
        {/* FAB */}
        {!mobileOpen && (
          <button onClick={() => setMobileOpen(true)}
            className="fixed bottom-20 right-4 z-20 w-14 h-14 rounded-full bg-brand text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform">
            <ShoppingCart size={22} />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gold text-white text-[10px] font-bold flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </button>
        )}

        {/* Bottom sheet overlay */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setMobileOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl flex flex-col"
              style={{ maxHeight: "85vh" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 shrink-0">
                <h2 className="font-bold text-sm text-stone-700 flex items-center gap-2">
                  <ShoppingCart size={16} /> Orden actual
                  {itemCount > 0 && <span className="ml-auto bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">{itemCount}</span>}
                </h2>
                {saleClient && <p className="text-[10px] text-gold font-medium ml-2">👤 {saleClient.name}</p>}
                <button onClick={() => setMobileOpen(false)} className="p-1.5 hover:bg-stone-100 rounded-lg ml-2">
                  <X size={18} className="text-stone-400" />
                </button>
              </div>
              <CartContent cart={cart} rate={rate} onUpdateQty={onUpdateQty} onRemove={onRemove}
                onCheckout={() => { setMobileOpen(false); onCheckout(); }}
                saleClient={saleClient} onAddRedemption={onAddRedemption} totalRef={totalRef} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
