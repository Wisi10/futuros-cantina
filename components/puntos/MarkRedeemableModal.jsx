"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Search, Loader2, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductImage, CANTINA_CATEGORIES } from "@/lib/utils";

const SORT_OPTIONS = [
  { id: "price_asc", label: "Precio asc" },
  { id: "price_desc", label: "Precio desc" },
  { id: "stock_desc", label: "Stock" },
];

export default function MarkRedeemableModal({ user, onClose, onMarked }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todas");
  const [sortKey, setSortKey] = useState("price_asc");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [pts, setPts] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id, name, photo_url, emoji, stock_quantity, is_cantina, active, is_redeemable, price_ref, category")
      .eq("active", true)
      .eq("is_cantina", true)
      .eq("is_redeemable", false)
      .order("name");
    setProducts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Counts per category (over the search-filtered universe so chip badges
  // reflect what the search actually shows)
  const searchFiltered = useMemo(() => products.filter((p) =>
    !search || (p.name || "").toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const categoryCounts = useMemo(() => {
    const counts = { Todas: searchFiltered.length };
    for (const c of CANTINA_CATEGORIES) counts[c] = 0;
    for (const p of searchFiltered) {
      const cat = CANTINA_CATEGORIES.includes(p.category) ? p.category : "Otro";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [searchFiltered]);

  const filtered = useMemo(() => {
    const base = activeCategory === "Todas"
      ? searchFiltered
      : searchFiltered.filter((p) => (CANTINA_CATEGORIES.includes(p.category) ? p.category : "Otro") === activeCategory);
    const cmp = (a, b) => {
      if (sortKey === "price_asc") return Number(a.price_ref || 0) - Number(b.price_ref || 0);
      if (sortKey === "price_desc") return Number(b.price_ref || 0) - Number(a.price_ref || 0);
      if (sortKey === "stock_desc") return Number(b.stock_quantity || 0) - Number(a.stock_quantity || 0);
      return 0;
    };
    return [...base].sort(cmp);
  }, [searchFiltered, activeCategory, sortKey]);

  const grouped = useMemo(() => {
    if (activeCategory !== "Todas") return [{ cat: activeCategory, items: filtered }];
    const buckets = {};
    for (const p of filtered) {
      const cat = CANTINA_CATEGORIES.includes(p.category) ? p.category : "Otro";
      (buckets[cat] = buckets[cat] || []).push(p);
    }
    return CANTINA_CATEGORIES
      .filter((c) => buckets[c] && buckets[c].length > 0)
      .map((c) => ({ cat: c, items: buckets[c] }));
  }, [filtered, activeCategory]);

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
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
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
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-2.5 text-xs bg-white shrink-0"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {["Todas", ...CANTINA_CATEGORIES].map((cat) => {
                const isActive = activeCategory === cat;
                const count = categoryCounts[cat] || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-stone-900 text-white"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            {loading ? (
              <p className="text-xs text-stone-400 animate-pulse text-center py-8">Cargando productos...</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-8">
                {products.length === 0
                  ? "Todos los productos cantina ya son canjeables"
                  : `Sin resultados`}
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3">
                {grouped.map((group) => (
                  <div key={group.cat}>
                    {activeCategory === "Todas" && (
                      <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-1.5 px-1">
                        {group.cat}
                      </p>
                    )}
                    <div className="space-y-1">
                      {group.items.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedProduct(p)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-stone-200 hover:border-brand hover:bg-stone-50 transition-colors"
                        >
                          <ProductImage product={p} size={32} className="rounded" />
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-sm font-medium text-stone-700 truncate">{(p.name || "").trim()}</p>
                            <p className="text-[11px] text-stone-400">
                              REF {Number(p.price_ref || 0).toFixed(2)} · stock {Number(p.stock_quantity || 0)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
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
