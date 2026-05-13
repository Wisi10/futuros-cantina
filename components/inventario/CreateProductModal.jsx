"use client";
import { useState } from "react";
import { X, Loader2, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { generateId, toTitleCase, CANTINA_CATEGORIES } from "@/lib/utils";

export default function CreateProductModal({ user, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Bebida");
  const [priceRef, setPriceRef] = useState("");
  const [costRef, setCostRef] = useState("");
  const [emoji, setEmoji] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim() && Number(priceRef) > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    const finalName = toTitleCase(name);
    try {
      // Duplicate check (case-insensitive exact match against the title-cased version)
      const { data: existing } = await supabase
        .from("products")
        .select("id, name")
        .ilike("name", finalName)
        .limit(1);
      if (existing && existing.length > 0) {
        setError(`Ya existe un producto con nombre "${existing[0].name}". Usa el existente o cambia el nombre.`);
        setSaving(false);
        return;
      }
      // Next sort_order
      const { data: maxRow } = await supabase
        .from("products")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = Number(maxRow?.[0]?.sort_order || 0) + 1;
      // Insert
      const newId = generateId();
      const { error: insertError } = await supabase.from("products").insert({
        id: newId,
        name: finalName,
        category: category || "Otro",
        price_ref: Number(priceRef),
        cost_ref: Number(costRef) || 0,
        emoji: emoji.trim() || null,
        is_cantina: true,
        active: true,
        sort_order: nextOrder,
        stock_quantity: 0,
      });
      if (insertError) throw insertError;
      if (onCreated) await onCreated(newId);
      onClose();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-stone-800 flex items-center gap-2">
            <Plus size={18} /> Crear producto
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg" disabled={saving}>
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
              placeholder="Ej: Tobo Polar 12u"
              maxLength={60}
              className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              autoFocus
            />
            {name.trim() && toTitleCase(name) !== name && (
              <p className="text-[11px] text-stone-400 mt-1">
                Se guardara como: <span className="font-medium text-stone-600">{toTitleCase(name)}</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none bg-white"
            >
              {CANTINA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
                Precio venta REF
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={priceRef}
                onChange={(e) => setPriceRef(e.target.value)}
                placeholder="0.00"
                className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
                Costo REF (opcional)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costRef}
                onChange={(e) => setCostRef(e.target.value)}
                placeholder="0.00"
                className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
              Emoji (opcional)
            </label>
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🍺"
              maxLength={4}
              className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          <p className="text-[11px] text-stone-400">
            El stock arranca en 0. Para agregar inventario, usa "Registrar entrada".
          </p>

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
              {saving ? <><Loader2 size={14} className="animate-spin" /> Creando...</> : "Crear producto"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
