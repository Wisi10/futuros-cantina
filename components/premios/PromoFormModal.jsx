"use client";
import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function PromoFormModal({ user, promo, onClose, onSaved }) {
  const isEdit = !!promo?.id;
  const [name, setName] = useState(promo?.name || "");
  const [tier, setTier] = useState(promo?.court_tier || "F5");
  const [hours, setHours] = useState(promo?.hours_threshold ? String(promo.hours_threshold) : "");
  const [productId, setProductId] = useState(promo?.product_id || "");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, is_cantina, active, stock_quantity")
        .eq("is_cantina", true)
        .eq("active", true)
        .order("sort_order");
      setProducts(data || []);
      setLoadingProducts(false);
    })();
  }, []);

  const canSubmit = name.trim() && tier && Number(hours) > 0 && productId && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const { data, error: rpcError } = await supabase.rpc("update_weekly_promo", {
          promo_id_param:        promo.id,
          name_param:            name.trim(),
          court_tier_param:      tier,
          hours_threshold_param: Number(hours),
          product_id_param:      productId,
          is_active_param:       null,
          updated_by_param:      user?.name || "Admin",
        });
        if (rpcError) throw rpcError;
        const result = data?.[0];
        if (!result?.success) throw new Error(result?.message || "Error guardando");
      } else {
        const { data, error: rpcError } = await supabase.rpc("create_weekly_promo", {
          name_param:            name.trim(),
          court_tier_param:      tier,
          hours_threshold_param: Number(hours),
          product_id_param:      productId,
          created_by_param:      user?.name || "Admin",
        });
        if (rpcError) throw rpcError;
        const result = data?.[0];
        if (!result?.success) throw new Error(result?.message || "Error creando");
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || "Error");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-stone-800">
            {isEdit ? "Editar promo" : "Crear nueva promo"}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg">
            <X size={18} className="text-stone-400" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Promo F7 Semanal"
              maxLength={60}
              className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
              Tier de cancha
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "F5", label: "F5" },
                { id: "F7", label: "F7" },
                { id: "F11", label: "F11" },
                { id: "any", label: "Cualquiera" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={`py-2 rounded-lg text-xs font-medium border-2 transition-all active:scale-95 ${
                    tier === t.id
                      ? "border-brand bg-brand/5 text-brand"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
              Horas / semana
            </label>
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="4"
              min="0.5"
              step="0.5"
              className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
              Producto premio (cantina activo)
            </label>
            {loadingProducts ? (
              <p className="text-xs text-stone-400 animate-pulse py-2">Cargando productos...</p>
            ) : products.length === 0 ? (
              <p className="text-xs text-stone-400 py-2">Sin productos cantina activos. Agrega uno en Config primero.</p>
            ) : (
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none bg-white"
              >
                <option value="">Selecciona un producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.name || "").trim()} (stock: {p.stock_quantity ?? 0})
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-3 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-30 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : isEdit ? "Guardar" : "Crear promo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
