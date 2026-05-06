"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Search, Loader2, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductImage } from "@/lib/utils";

export default function MarkRedeemableModal({ user, onClose, onMarked }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [pts, setPts] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id, name, photo_url, emoji, stock_quantity, is_cantina, active, is_redeemable")
      .eq("active", true)
      .eq("is_cantina", true)
      .eq("is_redeemable", false)
      .order("name");
    setProducts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((p) =>
    !search || (p.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleMark = async () => {
    if (!selectedProduct || !Number(pts) || saving) return;
    setSaving(true);
    setError("");
    try {
      const { error: updErr } = await supabase
        .from("products")
        .update({
          is_redeemable: true,
          redemption_cost_points: Number(pts),
        })
        .eq("id", selectedProduct.id);
      if (updErr) throw updErr;
      if (onMarked) await onMarked();
      onClose();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-bold text-stone-800 flex items-center gap-2">
            <Gift size={18} /> Marcar producto como premio
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg" disabled={saving}>
            <X size={18} className="text-stone-400" />
          </button>
        </div>

        {!selectedProduct ? (
          <div className="px-5 pb-5 flex-1 min-h-0 flex flex-col">
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                autoFocus
              />
            </div>

            {loading ? (
              <p className="text-xs text-stone-400 animate-pulse text-center py-8">Cargando productos...</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-8">
                {products.length === 0
                  ? "Todos los productos cantina ya son canjeables"
                  : `Sin resultados para "${search}"`}
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-stone-200 hover:border-brand hover:bg-stone-50 transition-colors"
                  >
                    <ProductImage product={p} size={32} className="rounded" />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-stone-700 truncate">{(p.name || "").trim()}</p>
                      <p className="text-[11px] text-stone-400">stock: {Number(p.stock_quantity || 0)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-3">
            <div className="bg-gold/5 border border-gold/20 rounded-xl p-3 flex items-center gap-3">
              <ProductImage product={selectedProduct} size={48} className="rounded" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-stone-800 truncate">{(selectedProduct.name || "").trim()}</p>
                <p className="text-[11px] text-stone-500">stock: {Number(selectedProduct.stock_quantity || 0)}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="text-xs text-brand hover:underline">
                Cambiar
              </button>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
                Costo en puntos
              </label>
              <input
                type="number"
                min="1"
                step="50"
                value={pts}
                onChange={(e) => setPts(e.target.value)}
                placeholder="Ej: 1000"
                className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                autoFocus
              />
              <p className="text-[11px] text-stone-400 mt-1">Multiplo de 50 recomendado para que sea facil para el cliente.</p>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedProduct(null)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 disabled:opacity-50"
              >
                Atras
              </button>
              <button
                onClick={handleMark}
                disabled={!Number(pts) || saving}
                className="flex-1 py-3 rounded-xl bg-gold text-white font-bold text-sm hover:bg-gold-hover disabled:opacity-30 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : "Marcar como premio"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
