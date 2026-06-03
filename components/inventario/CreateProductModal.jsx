"use client";
import { useState, useEffect, useMemo } from "react";
import { X, Loader2, ChevronRight, ChevronLeft, Plus, Trash2, Package, Coffee, Wheat, ShoppingBag, Pizza } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { generateId, toTitleCase, CANTINA_CATEGORIES, loadProductCategoryNames } from "@/lib/utils";

// ============================================================================
// Wizard de creación de producto unificado (Fase 3).
// Step 1: definición (qué tipo de producto + datos básicos).
// Step 2 branchea por type:
//   - producto / materia_prima  → primera entrada (proveedor + pack + qty + $)
//   - plato / bebida_preparada  → definir receta (ingredientes + qty)
//   - servicio                  → no hay step 2, se crea solo
// ============================================================================

const TYPES = [
  { id: "producto",          label: "Producto",         icon: Package,     desc: "Se vende como se compra (Gatorade, Tostitos, Agua)", forSell: true },
  { id: "plato",             label: "Plato",            icon: Pizza,       desc: "Comida hecha con ingredientes (Hamburguesa, Ración)", forSell: true,  hasRecipe: true },
  { id: "bebida_preparada",  label: "Bebida preparada", icon: Coffee,      desc: "Bebida preparada con ingredientes (Café, Capuccino)", forSell: true,  hasRecipe: true },
  { id: "materia_prima",     label: "Materia prima",    icon: Wheat,       desc: "Ingrediente, no se vende directo (Pan, Carne, Café granos)", forSell: false },
  { id: "servicio",          label: "Servicio",         icon: ShoppingBag, desc: "Servicio/alquiler sin stock (Hora Cancha, Mesa)", forSell: false, skipStep2: true },
];

// Para MATERIA PRIMA la unidad base SIEMPRE es la métrica menor (g, ml, u)
// porque las recetas usan cantidades pequeñas. Al ingresar stock, el staff
// puede comprar en kg/L y el sistema convierte (kg → ×1000 g, L → ×1000 ml).
const UNIT_LABELS_MP = ["u", "g", "ml"];
// Para productos sellables (producto/plato/bebida_preparada) la unidad típica
// es 1 u (1 botella/lata/plato). kg/g/ml/l disponibles si es algo a granel.
const UNIT_LABELS_SELL = ["u", "g", "kg", "ml", "l", "caja", "paq"];

const PAYMENT_METHODS = [
  { id: "pago_movil", label: "Pago Móvil", acceptsRef: true, refHint: "Últimos 4 dígitos" },
  { id: "zelle", label: "Zelle", needsRef: true, acceptsRef: true, refHint: "Email o ref" },
  { id: "cash_usd", label: "Cash USD" },
  { id: "cash_bs", label: "Cash Bs" },
  { id: "transferencia", label: "Transferencia", acceptsRef: true, refHint: "Nº transferencia" },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CreateProductModal({ user, onClose, onCreated, scope = "vendible" }) {
  // Step 1 state
  const [step, setStep] = useState(1);
  const [type, setType] = useState(scope === "materia" ? "materia_prima" : "producto");
  const [name, setName] = useState("");
  const [categories, setCategories] = useState(CANTINA_CATEGORIES);
  const [category, setCategory] = useState("Bebida");
  const [priceRef, setPriceRef] = useState("");
  const [unitSize, setUnitSize] = useState("1");
  const [unitLabel, setUnitLabel] = useState("u");
  const [usesPack, setUsesPack] = useState(false);
  const [packSize, setPackSize] = useState("");
  const [packLabel, setPackLabel] = useState("caja");
  const [emoji, setEmoji] = useState("");

  // Step 2 state — entrada (producto/MP)
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [entryQty, setEntryQty] = useState(""); // packs si usesPack, sino unidades
  const [entryTotalCost, setEntryTotalCost] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [paymentMethod, setPaymentMethod] = useState("pago_movil");
  const [paymentRef, setPaymentRef] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [entryNotes, setEntryNotes] = useState("");
  const [skipInitialStock, setSkipInitialStock] = useState(false);

  // Step 2 state — receta (plato/bebida_preparada)
  const [ingredients, setIngredients] = useState([]); // [{name, id, ...}]
  const [recipe, setRecipe] = useState([{ ingredientId: "", quantity: "" }]);
  const [skipInitialRecipe, setSkipInitialRecipe] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dupWarning, setDupWarning] = useState(null); // {name, id} if exists

  const typeMeta = useMemo(() => TYPES.find((t) => t.id === type), [type]);
  const isMP = type === "materia_prima";
  const isSellable = typeMeta?.forSell;
  const hasRecipe = typeMeta?.hasRecipe;

  // Load categories y suppliers + materia prima (para recetas)
  useEffect(() => {
    let alive = true;
    loadProductCategoryNames(supabase).then((cats) => {
      if (!alive) return;
      setCategories(cats);
      if (!cats.includes(category)) setCategory(cats[0] || "Otro");
    });
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => { if (alive && data) setSuppliers(data); });
    supabase
      .from("products")
      .select("id, name, emoji, cost_ref, unit_label, unit_size")
      .eq("active", true)
      .eq("type", "materia_prima")
      .order("name")
      .then(({ data }) => { if (alive && data) setIngredients(data); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detección de duplicado en tiempo real (debounced via simple effect)
  useEffect(() => {
    const titled = toTitleCase(name.trim());
    if (!titled || titled.length < 3) { setDupWarning(null); return; }
    let alive = true;
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, type")
        .ilike("name", titled)
        .eq("active", true)
        .limit(1);
      if (!alive) return;
      if (data && data.length > 0) {
        setDupWarning({ id: data[0].id, name: data[0].name, type: data[0].type });
      } else {
        setDupWarning(null);
      }
    }, 350);
    return () => { alive = false; clearTimeout(handle); };
  }, [name]);

  // Auto-calc para step 2 entrada
  const entryUnits = useMemo(() => {
    const q = Number(entryQty);
    if (!Number.isFinite(q) || q <= 0) return 0;
    if (usesPack) {
      const ps = Number(packSize);
      if (!Number.isFinite(ps) || ps <= 0) return 0;
      return q * ps;
    }
    return q;
  }, [entryQty, usesPack, packSize]);
  const entryCostPerUnit = useMemo(() => {
    const total = Number(entryTotalCost);
    if (!Number.isFinite(total) || total <= 0 || entryUnits <= 0) return 0;
    return total / entryUnits;
  }, [entryTotalCost, entryUnits]);

  // Auto-calc costo receta = SUM(ingrediente.cost_ref * qty)
  const recipeCost = useMemo(() => {
    return recipe.reduce((s, r) => {
      const ing = ingredients.find((i) => i.id === r.ingredientId);
      const q = Number(r.quantity);
      if (!ing || !Number.isFinite(q) || q <= 0) return s;
      return s + (Number(ing.cost_ref) || 0) * q;
    }, 0);
  }, [recipe, ingredients]);

  // Validación step 1
  const canNextStep1 = useMemo(() => {
    if (!name.trim()) return false;
    if (isSellable && (!Number(priceRef) || Number(priceRef) <= 0)) return false;
    if (!unitSize || Number(unitSize) <= 0 || !unitLabel.trim()) return false;
    if (usesPack && (!Number(packSize) || Number(packSize) <= 0)) return false;
    return true;
  }, [name, isSellable, priceRef, unitSize, unitLabel, usesPack, packSize]);

  // Validación step 2 — solo cuando NO se saltea
  const canSubmitStep2 = useMemo(() => {
    if (typeMeta?.skipStep2) return true;
    if (hasRecipe) {
      if (skipInitialRecipe) return true;
      const valid = recipe.filter((r) => r.ingredientId && Number(r.quantity) > 0);
      return valid.length > 0;
    }
    // producto/materia_prima
    if (skipInitialStock) return true;
    if (!supplierId && !newSupplierName.trim()) return false;
    if (!Number(entryQty) || Number(entryQty) <= 0) return false;
    if (!Number(entryTotalCost) || Number(entryTotalCost) <= 0) return false;
    if (paymentStatus === "paid") {
      const m = PAYMENT_METHODS.find((p) => p.id === paymentMethod);
      if (m?.needsRef && !paymentRef.trim()) return false;
    }
    return true;
  }, [typeMeta, hasRecipe, skipInitialRecipe, recipe, skipInitialStock, supplierId, newSupplierName, entryQty, entryTotalCost, paymentStatus, paymentMethod, paymentRef]);

  // ---- Submit ----
  const handleSubmit = async () => {
    if (!canSubmitStep2) return;
    setSaving(true);
    setError("");
    try {
      const finalName = toTitleCase(name.trim());

      // Re-check dup (race condition)
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .ilike("name", finalName)
        .eq("active", true)
        .limit(1);
      if (existing && existing.length > 0) {
        setError(`"${finalName}" ya existe. Cambia el nombre o cancela.`);
        setSaving(false);
        return;
      }

      // Asegurar supplier_id si es nuevo
      let resolvedSupplierId = supplierId || null;
      if (!hasRecipe && !skipInitialStock && !typeMeta?.skipStep2 && !resolvedSupplierId && newSupplierName.trim()) {
        const supName = newSupplierName.trim();
        const { data: sup, error: supErr } = await supabase
          .from("suppliers")
          .insert({ name: supName })
          .select("id")
          .single();
        if (supErr) throw supErr;
        resolvedSupplierId = sup.id;
      }

      // 1) Crear producto
      const newId = generateId();
      const { data: maxRow } = await supabase
        .from("products")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = Number(maxRow?.[0]?.sort_order || 0) + 1;

      const productRow = {
        id: newId,
        name: finalName,
        type,
        category: isMP ? "Materia Prima" : (category || "Otro"),
        price_ref: isSellable ? Number(priceRef) : 0,
        cost_ref: hasRecipe ? recipeCost : entryCostPerUnit || 0,
        emoji: emoji.trim() || null,
        is_cantina: isSellable,
        active: true,
        sort_order: nextOrder,
        stock_quantity: 0,
        unit_size: Number(unitSize),
        unit_label: unitLabel.trim(),
        pack_size: usesPack ? Number(packSize) : null,
        pack_label: usesPack ? packLabel.trim() : null,
        has_recipe: hasRecipe,
      };
      const { error: insertErr } = await supabase.from("products").insert(productRow);
      if (insertErr) throw insertErr;

      // 2) Branching por type
      if (typeMeta?.skipStep2) {
        // Servicio: nada más
      } else if (hasRecipe && !skipInitialRecipe) {
        // Plato / bebida_preparada → guardar receta
        const recipeRows = recipe
          .filter((r) => r.ingredientId && Number(r.quantity) > 0)
          .map((r) => ({
            id: "rec_" + generateId(),
            product_id: newId,
            ingredient_id: r.ingredientId,
            quantity: Number(r.quantity),
            unit: ingredients.find((i) => i.id === r.ingredientId)?.unit_label || "u",
          }));
        if (recipeRows.length > 0) {
          const { error: recipeErr } = await supabase.from("product_recipes").insert(recipeRows);
          if (recipeErr) throw recipeErr;
        }
      } else if (!hasRecipe && !skipInitialStock) {
        // Producto / materia_prima → primera entrada
        const totalCost = Number(entryTotalCost);
        const restockId = "rs_" + generateId();
        const isPaid = paymentStatus === "paid";
        const { error: restockErr } = await supabase.from("cantina_restocks").insert({
          id: restockId,
          supplier: suppliers.find((s) => s.id === resolvedSupplierId)?.name || newSupplierName.trim(),
          supplier_id: resolvedSupplierId,
          restock_date: entryDate,
          total_cost_ref: totalCost,
          paid_amount_ref: isPaid ? totalCost : 0,
          payment_status: isPaid ? "paid" : "pending",
          due_date: isPaid ? null : dueDate,
          notes: entryNotes.trim() || null,
          created_by: user?.name || "Cantina",
        });
        if (restockErr) throw restockErr;

        // Items del restock (1 row para este producto)
        await supabase.from("cantina_restock_items").insert({
          id: "ri_" + generateId(),
          restock_id: restockId,
          product_id: newId,
          quantity: entryUnits,
          unit_cost_ref: entryCostPerUnit,
          subtotal_ref: totalCost,
        });

        // Actualizar stock + MAC del producto (el trigger lo hace, pero confirmo)
        await supabase
          .from("products")
          .update({ stock_quantity: entryUnits, cost_ref: entryCostPerUnit })
          .eq("id", newId);

        // Audit stock_movement
        await supabase.from("stock_movements").insert({
          id: "sm_" + generateId(),
          product_id: newId,
          product_name: finalName,
          movement_type: "restock",
          quantity: entryUnits,
          reference_id: restockId,
          notes: `Primera entrada al crear producto${entryNotes ? ` · ${entryNotes}` : ""}`,
          created_by: user?.name || "Cantina",
          cost_ref: entryCostPerUnit,
        });

        // Si pagada → expense automático
        if (isPaid) {
          await supabase.from("expenses").insert({
            id: "exp_" + generateId(),
            expense_type: "variable",
            category: isMP ? "Materia Prima" : "Cantina",
            name: `Compra ${suppliers.find((s) => s.id === resolvedSupplierId)?.name || newSupplierName.trim()}`,
            amount_usd: totalCost,
            payment_method: paymentMethod,
            reference: paymentRef.trim() || null,
            provider: suppliers.find((s) => s.id === resolvedSupplierId)?.name || newSupplierName.trim(),
            expense_date: entryDate,
            created_by: user?.name || "Cantina",
            notes: `Auto-creado al crear producto ${finalName}${entryNotes ? ` · ${entryNotes}` : ""}`,
          });
        }
      }

      if (onCreated) await onCreated(newId);
      onClose();
    } catch (e) {
      setError("Error: " + (e.message || String(e)));
    }
    setSaving(false);
  };

  const stepLabel = step === 1 ? "1 de 2 · Definición" : (typeMeta?.skipStep2 ? "" : (hasRecipe ? "2 de 2 · Receta" : "2 de 2 · Primera entrada"));
  const showStep2 = !typeMeta?.skipStep2;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-stone-100">
          <div>
            <h2 className="text-base font-bold text-stone-800">+ Crear producto</h2>
            <p className="text-[11px] text-stone-500 mt-0.5">{stepLabel}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg" disabled={saving}>
            <X size={18} className="text-stone-400" />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {step === 1 && (
            <>
              {/* Type selector */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-2">¿Qué tipo de producto?</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {TYPES.map((t) => {
                    const Icon = t.icon;
                    const active = type === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setType(t.id)}
                        className={`flex items-start gap-3 text-left rounded-xl border-2 p-3 transition-colors ${
                          active ? "border-brand bg-brand/5" : "border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        <Icon size={18} className={active ? "text-brand mt-0.5" : "text-stone-500 mt-0.5"} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold ${active ? "text-brand" : "text-stone-800"}`}>{t.label}</p>
                          <p className="text-[11px] text-stone-500 leading-snug">{t.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Gatorade, Hamburguesa, Aceite Diana 1L"
                  maxLength={60}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  autoFocus
                />
                {dupWarning && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1.5">
                    ⚠️ Ya existe <b>{dupWarning.name}</b> ({dupWarning.type}). Si quieres agregar inventario al existente, cierra esto y usa Registrar entrada.
                  </p>
                )}
              </div>

              {/* Categoría */}
              {!isMP && type !== "servicio" && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none bg-white"
                  >
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {/* Precio (solo si se vende) */}
              {isSellable && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Precio venta $</label>
                  <input
                    type="number" step="0.01" min="0.01"
                    value={priceRef}
                    onChange={(e) => setPriceRef(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
              )}

              {/* Unidad base — MP solo permite métrica menor (g/ml/u) */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
                  {isMP ? "Unidad base para recetas" : "¿Qué representa 1 unidad?"}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" min="0.01"
                    value={unitSize}
                    onChange={(e) => setUnitSize(e.target.value)}
                    placeholder="1"
                    className="flex-1 border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  />
                  {isMP ? (
                    <select
                      value={unitLabel}
                      onChange={(e) => setUnitLabel(e.target.value)}
                      className="w-32 border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none bg-white"
                    >
                      {UNIT_LABELS_MP.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  ) : (
                    <>
                      <input
                        list="unit-labels-wiz"
                        type="text"
                        value={unitLabel}
                        onChange={(e) => setUnitLabel(e.target.value)}
                        placeholder="u / kg / ml"
                        maxLength={12}
                        className="w-32 border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                      />
                      <datalist id="unit-labels-wiz">
                        {UNIT_LABELS_SELL.map((l) => <option key={l} value={l} />)}
                      </datalist>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-stone-400 mt-1">
                  {isMP
                    ? "Solo g, ml o u (la métrica menor). Al ingresar, podrás comprar en kg/L/caja y el sistema convierte automático."
                    : "Ej. 1 u (1 botella), 500 ml (botella aceite), 1 kg (carne)."}
                </p>
              </div>

              {/* Pack toggle (solo para producto/MP) */}
              {!hasRecipe && type !== "servicio" && (
                <div className="border border-stone-200 rounded-lg p-3 bg-stone-50">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={usesPack} onChange={(e) => setUsesPack(e.target.checked)} />
                    <span className="text-sm font-medium text-stone-700">Lo compras en pack / caja / bulto</span>
                  </label>
                  {usesPack && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">¿Cuántas {unitLabel || "u"} trae 1?</label>
                        <input
                          type="number" step="1" min="1"
                          value={packSize}
                          onChange={(e) => setPackSize(e.target.value)}
                          placeholder="12"
                          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Nombre del pack</label>
                        <input
                          type="text"
                          value={packLabel}
                          onChange={(e) => setPackLabel(e.target.value)}
                          placeholder="caja / bulto"
                          maxLength={12}
                          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Emoji */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Emoji (opcional)</label>
                <input
                  type="text"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  placeholder="🍺"
                  maxLength={4}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </>
          )}

          {step === 2 && !typeMeta?.skipStep2 && hasRecipe && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                <p className="font-medium mb-1">📝 Define la receta de <b>{toTitleCase(name)}</b></p>
                <p className="text-[11px] text-blue-700">Cada ingrediente con su cantidad. El costo total se calcula automático sumando.</p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={skipInitialRecipe} onChange={(e) => setSkipInitialRecipe(e.target.checked)} />
                <span className="text-sm text-stone-600">Definir receta después (crear solo el producto)</span>
              </label>

              {!skipInitialRecipe && (
                <>
                  {recipe.map((r, idx) => {
                    const ing = ingredients.find((i) => i.id === r.ingredientId);
                    return (
                      <div key={idx} className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Ingrediente</label>
                          <select
                            value={r.ingredientId}
                            onChange={(e) => {
                              const next = [...recipe];
                              next[idx].ingredientId = e.target.value;
                              setRecipe(next);
                            }}
                            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
                          >
                            <option value="">Elegir...</option>
                            {ingredients.map((i) => (
                              <option key={i.id} value={i.id}>{i.emoji ? `${i.emoji} ` : ""}{i.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-32">
                          <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Cantidad {ing?.unit_label ? `(${ing.unit_label})` : ""}</label>
                          <input
                            type="number" step="0.01" min="0"
                            value={r.quantity}
                            onChange={(e) => {
                              const next = [...recipe];
                              next[idx].quantity = e.target.value;
                              setRecipe(next);
                            }}
                            placeholder="1"
                            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setRecipe(recipe.filter((_, i) => i !== idx))}
                          disabled={recipe.length === 1}
                          className="p-2 text-stone-400 hover:text-red-500 disabled:opacity-30"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setRecipe([...recipe, { ingredientId: "", quantity: "" }])}
                    className="text-xs text-brand font-medium flex items-center gap-1 hover:underline"
                  >
                    <Plus size={12} /> Agregar ingrediente
                  </button>

                  {recipeCost > 0 && (
                    <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-sm">
                      Costo de receta: <b>${recipeCost.toFixed(2)}</b>
                      {Number(priceRef) > 0 && (
                        <span className="ml-2 text-stone-500">
                          (margen <b>{Math.round((1 - recipeCost / Number(priceRef)) * 100)}%</b>)
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === 2 && !typeMeta?.skipStep2 && !hasRecipe && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                <p className="font-medium mb-1">📦 Primera entrada de <b>{toTitleCase(name)}</b></p>
                <p className="text-[11px] text-blue-700">
                  El stock arranca en {entryUnits || 0} {unitLabel}.
                  {entryCostPerUnit > 0 && <> Costo unitario: <b>${entryCostPerUnit.toFixed(4)}</b>.</>}
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={skipInitialStock} onChange={(e) => setSkipInitialStock(e.target.checked)} />
                <span className="text-sm text-stone-600">Sin stock inicial (registrar entrada después)</span>
              </label>

              {!skipInitialStock && (
                <>
                  {/* Proveedor */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Proveedor</label>
                    <select
                      value={supplierId}
                      onChange={(e) => { setSupplierId(e.target.value); setNewSupplierName(""); }}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none bg-white"
                    >
                      <option value="">— Nuevo proveedor —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {!supplierId && (
                      <input
                        type="text"
                        value={newSupplierName}
                        onChange={(e) => setNewSupplierName(e.target.value)}
                        placeholder="Nombre del proveedor nuevo"
                        className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none mt-1.5"
                      />
                    )}
                  </div>

                  {/* Qty + total cost */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
                        {usesPack ? `¿Cuántos ${packLabel || "packs"}?` : `¿Cuántas ${unitLabel}?`}
                      </label>
                      <input
                        type="number" step="0.01" min="0.01"
                        value={entryQty}
                        onChange={(e) => setEntryQty(e.target.value)}
                        placeholder={usesPack ? "1" : "10"}
                        className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                      />
                      {usesPack && entryUnits > 0 && (
                        <p className="text-[10px] text-stone-400 mt-1">= {entryUnits} {unitLabel}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Costo TOTAL del lote $</label>
                      <input
                        type="number" step="0.01" min="0.01"
                        value={entryTotalCost}
                        onChange={(e) => setEntryTotalCost(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                      />
                      {entryCostPerUnit > 0 && (
                        <p className="text-[10px] text-stone-400 mt-1">= ${entryCostPerUnit.toFixed(4)} / {unitLabel}</p>
                      )}
                    </div>
                  </div>

                  {/* Fecha entrada */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Fecha de entrada</label>
                    <input
                      type="date"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>

                  {/* Payment status toggle */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">¿Estado del pago?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentStatus("paid")}
                        className={`py-2 rounded-lg text-sm font-bold ${paymentStatus === "paid" ? "bg-brand text-white" : "bg-stone-100 text-stone-600"}`}
                      >Ya pagada</button>
                      <button
                        type="button"
                        onClick={() => setPaymentStatus("pending")}
                        className={`py-2 rounded-lg text-sm font-bold ${paymentStatus === "pending" ? "bg-amber-500 text-white" : "bg-stone-100 text-stone-600"}`}
                      >Por pagar</button>
                    </div>
                  </div>

                  {paymentStatus === "paid" ? (
                    <>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Método de pago</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => { setPaymentMethod(e.target.value); setPaymentRef(""); }}
                          className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none bg-white"
                        >
                          {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      </div>
                      {(() => {
                        const m = PAYMENT_METHODS.find((x) => x.id === paymentMethod);
                        if (!m?.needsRef && !m?.acceptsRef) return null;
                        return (
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
                              Referencia {!m.needsRef && <span className="font-normal text-stone-400">(opcional)</span>}
                            </label>
                            <input
                              type="text"
                              maxLength={20}
                              value={paymentRef}
                              onChange={(e) => setPaymentRef(e.target.value)}
                              placeholder={m.refHint || "Referencia"}
                              className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                            />
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Vence el</label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Notas (opcional)</label>
                    <input
                      type="text"
                      value={entryNotes}
                      onChange={(e) => setEntryNotes(e.target.value)}
                      placeholder="Detalle del lote"
                      className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && typeMeta?.skipStep2 && (
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-sm text-stone-700">
              Listo para crear el servicio <b>{toTitleCase(name)}</b>. Los servicios no requieren stock ni receta.
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-100 px-5 py-3 flex gap-2">
          {step === 1 ? (
            <>
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50"
              >Cancelar</button>
              <button
                onClick={() => {
                  if (typeMeta?.skipStep2) {
                    // Skip step 2 entirely for servicio
                    setStep(2);
                  } else {
                    setStep(2);
                  }
                }}
                disabled={!canNextStep1}
                className="flex-1 py-3 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-30 flex items-center justify-center gap-2"
              >
                Siguiente <ChevronRight size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                disabled={saving}
                className="flex items-center gap-1 px-4 py-3 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50"
              >
                <ChevronLeft size={16} /> Volver
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmitStep2 || saving}
                className="flex-1 py-3 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-30 flex items-center justify-center gap-2"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Creando...</> : "Crear producto"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
