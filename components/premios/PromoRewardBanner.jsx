"use client";
import { useState, useEffect, useCallback } from "react";
import { Gift, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function PromoRewardBanner({ saleClient, cart, onAddPromo }) {
  const [available, setAvailable] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [adding, setAdding]       = useState(null);

  const load = useCallback(async () => {
    if (!saleClient?.id || !supabase) {
      setAvailable([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_client_promo_progress", {
        client_id_param: saleClient.id,
      });
      const ready = (data || []).filter((p) => p.status === "available");
      setAvailable(ready);
    } catch (e) {
      console.error("[PROMO BANNER] load error:", e);
      setAvailable([]);
    }
    setLoading(false);
  }, [saleClient?.id]);

  useEffect(() => { load(); }, [load]);

  if (!saleClient?.id || loading) return null;

  // Hide promos that are already in the cart
  const visible = available.filter(
    (p) => !cart?.some((i) => i.isPromo && i.promoId === p.promo_id)
  );

  if (visible.length === 0) return null;

  const handleAdd = async (promo) => {
    if (adding || !onAddPromo) return;
    setAdding(promo.promo_id);
    // Need to fetch product details for cart item — query products table
    try {
      const { data } = await supabase
        .from("products")
        .select("id, name, emoji, photo_url, stock_quantity, price_ref, cost_ref, active")
        .eq("id", promo.product_id)
        .single();
      if (data && (!data.active || (data.stock_quantity ?? 0) <= 0)) {
        alert(`Producto no disponible (${!data.active ? "inactivo" : "sin stock"})`);
        setAdding(null);
        return;
      }
      if (data) {
        onAddPromo(data, promo.promo_id);
      } else {
        alert("Producto no encontrado");
      }
    } catch (e) {
      console.error("[PROMO BANNER] add error:", e);
      alert("Error agregando premio: " + e.message);
    }
    setAdding(null);
  };

  return (
    <div className="bg-gold/10 border-b border-gold/30 px-4 py-3">
      <div className="max-w-lg mx-auto space-y-2">
        {visible.map((p) => (
          <div
            key={p.promo_id}
            className="flex items-center gap-3 bg-white border-2 border-gold/40 rounded-xl p-3"
          >
            <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
              <Gift size={18} className="text-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-gold font-bold">
                Premio disponible
              </p>
              <p className="text-sm font-bold text-stone-800 truncate">
                {(p.product_name || "").trim() || "Premio"}
              </p>
              <p className="text-[11px] text-stone-500 truncate">
                {(p.promo_name || "").trim()}
              </p>
            </div>
            <button
              onClick={() => handleAdd(p)}
              disabled={adding === p.promo_id}
              className="px-3 py-2 bg-gold text-white rounded-lg text-xs font-bold hover:bg-gold-hover disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0"
            >
              {adding === p.promo_id ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              Agregar gratis
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
