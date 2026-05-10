"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { X, Plus, Trash2, Search, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF } from "@/lib/utils";

const UNITS = ["unidad", "g", "kg", "ml", "l", "cucharada", "rebanada", "rodaja", "pizca"];

export default function RecipeEditor({ product, user, onClose, onSaved }) {
  const isAdmin = user?.cantinaRole === "admin";
  const [hasRecipe, setHasRecipe] = useState(!!product?.has_recipe);
  const [costOverride, setCostOverride] = useState(
    product?.recipe_cost_override != null ? String(product.recipe_cost_override) : ""
  );
  const [ingredients, setIngredients] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: recipes }, { data: rawAll }] = await Promise.all([
      supabase
        .from("product_recipes")
        .select("id, ingredient_id, quantity, unit, notes")
        .eq("product_id", product.id),
      supabase
        .from("products")
        .select("id, name, cost_ref, stock_quantity, is_cantina, has_recipe, active")
        .eq("is_cantina", false)
        .eq("active", true)
        .order("name"),
    ]);
    const rawMap = {};
    (rawAll || []).forEach((r) => { rawMap[r.id] = r; });
    setRawMaterials(rawAll || []);
    const enriched = (recipes || []).map((r) => ({
      key: r.id,
      ingredient_id: r.ingredient_id,
      ingredient_name: rawMap[r.ingredient_id]?.name || "(eliminado)",
      ingredient_cost: Number(rawMap[r.ingredient_id]?.cost_ref || 0),
      quantity: Number(r.quantity || 0),
      unit: r.unit || "unidad",
      notes: r.notes || "",
    }));
    setIngredients(enriched);
    setLoading(false);
  }, [product.id]);

  useEffect(() => { load(); }, [load]);

  const totalCost = useMemo(() => {
    return ingredients.reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.ingredient_cost || 0)), 0);
  }, [ingredients]);

  const filteredRaw = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return rawMaterials
      .filter((p) => !p.has_recipe)
      .filter((p) => !q || (p.name || "").toLowerCase().includes(q))
      .filter((p) => !ingredients.some((i) => i.ingredient_id === p.id))
      .slice(0, 30);
  }, [rawMaterials, pickerSearch, ingredients]);

  const addIngredient = (rawProduct) => {
    setIngredients((prev) => [
      ...prev,
      {
        key: `tmp_${rawProduct.id}_${Date.now()}`,
        ingredient_id: rawProduct.id,
        ingredient_name: rawProduct.name,
        ingredient_cost: Number(rawProduct.cost_ref || 0),
        quantity: 1,
        unit: "unidad",
        notes: "",
      },
    ]);
    setPickerSearch("");
    setShowPicker(false);
  };

  const updateRow = (key, patch) => {
    setIngredients((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const removeRow = (key) => {
    setIngredients((prev) => prev.filter((i) => i.key !== key));
  };

  async function handleSave() {
    if (saving) return;
    setError("");
    setSaving(true);
    const payload = ingredients
      .filter((i) => i.ingredient_id && Number(i.quantity) > 0)
      .map((i) => ({
        ingredient_id: i.ingredient_id,
        quantity: Number(i.quantity),
        unit: i.unit || "unidad",
        notes: i.notes || null,
      }));
    const overrideNum = costOverride.trim() === "" ? null : Number(costOverride);
    if (overrideNum != null && (!Number.isFinite(overrideNum) || overrideNum < 0)) {
      setError("Override de costo invalido");
      setSaving(false);
      return;
    }
    try {
      const { data, error: rpcErr } = await supabase.rpc("set_product_recipe", {
        p_product_id: product.id,
        p_ingredients: payload,
        p_has_recipe: hasRecipe,
        p_cost_override: overrideNum,
      });
      if (rpcErr) throw rpcErr;
      if (!data?.success) throw new Error(data?.error || "Error guardando receta");
      await onSaved();
    } catch (e) {
      setError(e.message || "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div>
            <p className="text-xs text-stone-500">Receta de</p>
            <h2 className="text-base font-bold text-stone-800">{product.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg">
            <X size={18} className="text-stone-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-2">
            <input
              id="has-recipe-toggle"
              type="checkbox"
              checked={hasRecipe}
              onChange={(e) => setHasRecipe(e.target.checked)}
              disabled={!isAdmin}
              className="w-4 h-4"
            />
            <label htmlFor="has-recipe-toggle" className="text-sm font-semibold text-stone-700">
              Este producto tiene receta (consume materia prima al venderse)
            </label>
          </div>

          {hasRecipe && (
            <>
              {loading ? (
                <p className="text-xs text-stone-400 animate-pulse text-center py-4">Cargando...</p>
              ) : (
                <>
                  <div className="border border-stone-200 rounded-xl overflow-hidden">
                    {ingredients.length === 0 ? (
                      <p className="text-xs text-stone-400 text-center py-4">Sin ingredientes. Agrega abajo.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-stone-50 text-[10px] text-stone-500 uppercase tracking-wider">
                          <tr>
                            <th className="text-left px-3 py-2">Ingrediente</th>
                            <th className="text-right px-3 py-2 w-16">Cant</th>
                            <th className="text-left px-3 py-2 w-24">Unidad</th>
                            <th className="text-right px-3 py-2 w-20">Subtotal</th>
                            {isAdmin && <th className="w-8"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {ingredients.map((i) => {
                            const subtotal = Number(i.quantity || 0) * Number(i.ingredient_cost || 0);
                            return (
                              <tr key={i.key} className="border-t border-stone-100">
                                <td className="px-3 py-2 text-stone-700">
                                  <div>{i.ingredient_name}</div>
                                  <div className="text-[10px] text-stone-400">REF {Number(i.ingredient_cost).toFixed(2)} c/u</div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={i.quantity}
                                    onChange={(e) => updateRow(i.key, { quantity: e.target.value })}
                                    disabled={!isAdmin}
                                    className="w-14 border border-stone-200 rounded px-1.5 py-1 text-right text-xs focus:outline-none focus:border-brand"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <select
                                    value={i.unit}
                                    onChange={(e) => updateRow(i.key, { unit: e.target.value })}
                                    disabled={!isAdmin}
                                    className="w-full border border-stone-200 rounded px-1.5 py-1 text-xs bg-white"
                                  >
                                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-2 text-right text-stone-700 font-medium">
                                  {formatREF(subtotal)}
                                </td>
                                {isAdmin && (
                                  <td className="px-2 py-2 text-right">
                                    <button onClick={() => removeRow(i.key)} className="text-stone-400 hover:text-red-500 p-1">
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {isAdmin && (
                    <div>
                      {!showPicker ? (
                        <button
                          onClick={() => setShowPicker(true)}
                          className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium"
                        >
                          <Plus size={12} /> Agregar ingrediente
                        </button>
                      ) : (
                        <div className="border border-stone-200 rounded-xl p-3 bg-stone-50/40">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-stone-600">Agregar ingrediente</span>
                            <button onClick={() => { setShowPicker(false); setPickerSearch(""); }} className="text-stone-400 hover:text-stone-600 text-xs">Cancelar</button>
                          </div>
                          <div className="relative mb-2">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Buscar materia prima..."
                              value={pickerSearch}
                              onChange={(e) => setPickerSearch(e.target.value)}
                              className="w-full border border-stone-200 rounded-lg pl-7 pr-3 py-1.5 text-sm focus:outline-none focus:border-brand"
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {filteredRaw.length === 0 ? (
                              <p className="text-xs text-stone-400 text-center py-2">Sin resultados</p>
                            ) : (
                              filteredRaw.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => addIngredient(p)}
                                  className="w-full text-left px-2 py-1.5 hover:bg-white rounded text-sm flex items-center justify-between"
                                >
                                  <span className="text-stone-700">{p.name}</span>
                                  <span className="text-[11px] text-stone-400">REF {Number(p.cost_ref || 0).toFixed(2)}</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-stone-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-500">Costo calculado</span>
                      <span className="font-bold text-stone-800">{formatREF(totalCost)}</span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-stone-500 shrink-0">Override (opcional):</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={costOverride}
                          onChange={(e) => setCostOverride(e.target.value)}
                          placeholder="—"
                          className="flex-1 border border-stone-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-stone-200 p-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 disabled:opacity-50"
          >
            {isAdmin ? "Cancelar" : "Cerrar"}
          </button>
          {isAdmin && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : "Guardar receta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
