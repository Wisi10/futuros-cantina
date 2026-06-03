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
  const [emoji, setEmoji] = useState("");
  // Perfil doble (solo MP base=u): pesa también X g por unidad.
  // Ej. Tomate base=u + weight_per_unit=150 → 1 tomate ≈ 150 g.
  // Permite que la receta pida 30 g de tomate y el sistema convierta.
  const [hasWeight, setHasWeight] = useState(false);
  const [weightPerUnit, setWeightPerUnit] = useState("");
  const [weightUnit, setWeightUnit] = useState("g");

  // Step 2 state — entrada (producto/MP) — el "pack" es del LOTE, no del producto.
  // packKind define cómo viene esta vez:
  //   'sueltos'  → input directo en la unidad base (g/ml/u)
  //   'mayor'    → input en kg/L, multiplica × 1000 (solo si base = g o ml)
  //   'pack'     → packSize unidades por pack × cantidad de packs
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [packKind, setPackKind] = useState("sueltos");
  const [packSizeLote, setPackSizeLote] = useState(""); // unidades por pack en este lote
  const [packLabelLote, setPackLabelLote] = useState("bolsa");
  const [entryQty, setEntryQty] = useState(""); // cantidad en la unidad del packKind
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
  const isSellable = typeMeta?.forSell; // is_cantina=true en DB (aparece en POS)
  const hasPrice = type !== "materia_prima"; // todos salvo MP llevan precio venta
  const hasRecipe = typeMeta?.hasRecipe;

  // Reset packKind si la unidad base cambia y "mayor" ya no aplica
  useEffect(() => {
    if (packKind === "mayor" && unitLabel !== "g" && unitLabel !== "ml") {
      setPackKind("sueltos");
    }
  }, [unitLabel, packKind]);

  // Reset unitLabel a opción válida cuando cambia type (MP solo permite g/ml/u)
  useEffect(() => {
    if (isMP && !["g", "ml", "u"].includes(unitLabel)) {
      setUnitLabel("u");
    }
  }, [isMP, unitLabel]);

  // weight_per_unit solo aplica a MP base=u. Si cambia algo, resetear.
  useEffect(() => {
    if (!isMP || unitLabel !== "u") {
      setHasWeight(false);
      setWeightPerUnit("");
    }
  }, [isMP, unitLabel]);

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
      .select("id, name, emoji, cost_ref, unit_label, unit_size, weight_per_unit, weight_unit")
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
  // Stock final en unidad base = entryQty × multiplicador según packKind
  const entryUnits = useMemo(() => {
    const q = Number(entryQty);
    if (!Number.isFinite(q) || q <= 0) return 0;
    if (packKind === "mayor") return q * 1000; // kg→g o L→ml
    if (packKind === "pack") {
      const ps = Number(packSizeLote);
      if (!Number.isFinite(ps) || ps <= 0) return 0;
      return q * ps;
    }
    return q; // sueltos
  }, [entryQty, packKind, packSizeLote]);
  const entryCostPerUnit = useMemo(() => {
    const total = Number(entryTotalCost);
    if (!Number.isFinite(total) || total <= 0 || entryUnits <= 0) return 0;
    return total / entryUnits;
  }, [entryTotalCost, entryUnits]);

  // Auto-calc costo receta = SUM(ingrediente.cost_ref * qty_en_base)
  // Si la receta usa weight_unit (g/ml) y el ingrediente tiene weight_per_unit,
  // convertir a la unidad base del ingrediente antes de multiplicar por cost_ref.
  // Ej: receta dice 30 g de Tomate. Tomate base=u, weight_per_unit=150 g.
  //     qty_en_base = 30/150 = 0.2 u. cost = 0.2 × cost_ref(per u).
  const recipeCost = useMemo(() => {
    return recipe.reduce((s, r) => {
      const ing = ingredients.find((i) => i.id === r.ingredientId);
      const q = Number(r.quantity);
      if (!ing || !Number.isFinite(q) || q <= 0) return s;
      let qtyInBase = q;
      const usingWeight = r.unit && r.unit === ing.weight_unit && ing.weight_per_unit;
      if (usingWeight) qtyInBase = q / Number(ing.weight_per_unit);
      return s + (Number(ing.cost_ref) || 0) * qtyInBase;
    }, 0);
  }, [recipe, ingredients]);

  // Validación step 1 — solo definición permanente
  const canNextStep1 = useMemo(() => {
    if (!name.trim()) return false;
    if (hasPrice && (!Number(priceRef) || Number(priceRef) <= 0)) return false;
    if (!unitSize || Number(unitSize) <= 0 || !unitLabel.trim()) return false;
    if (hasWeight && (!Number(weightPerUnit) || Number(weightPerUnit) <= 0)) return false;
    return true;
  }, [name, hasPrice, priceRef, unitSize, unitLabel, hasWeight, weightPerUnit]);

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
    if (packKind === "pack" && (!Number(packSizeLote) || Number(packSizeLote) <= 0 || !packLabelLote.trim())) return false;
    if (!Number(entryTotalCost) || Number(entryTotalCost) <= 0) return false;
    if (paymentStatus === "paid") {
      const m = PAYMENT_METHODS.find((p) => p.id === paymentMethod);
      if (m?.needsRef && !paymentRef.trim()) return false;
    }
    return true;
  }, [typeMeta, hasRecipe, skipInitialRecipe, recipe, skipInitialStock, supplierId, newSupplierName, entryQty, entryTotalCost, packKind, packSizeLote, packLabelLote, paymentStatus, paymentMethod, paymentRef]);

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
        category: isMP ? "Materia Prima" : (type === "servicio" ? "Servicio" : (category || "Otro")),
        price_ref: hasPrice ? Number(priceRef) : 0,
        cost_ref: hasRecipe ? recipeCost : entryCostPerUnit || 0,
        emoji: emoji.trim() || null,
        is_cantina: isSellable,
        active: true,
        sort_order: nextOrder,
        stock_quantity: 0,
        unit_size: Number(unitSize),
        unit_label: unitLabel.trim(),
        // pack_size/pack_label son del LOTE, no permanentes del producto. NULL aquí.
        pack_size: null,
        pack_label: null,
        // Perfil doble (solo aplica a MP base=u con peso/vol también)
        weight_per_unit: hasWeight ? Number(weightPerUnit) : null,
        weight_unit: hasWeight ? weightUnit : null,
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
          .map((r) => {
            const ing = ingredients.find((i) => i.id === r.ingredientId);
            // Si el usuario eligió unidad (perfil doble), usa esa. Sino, la base del ingrediente.
            const unit = r.unit || ing?.unit_label || "u";
            return {
              id: "rec_" + generateId(),
              product_id: newId,
              ingredient_id: r.ingredientId,
              quantity: Number(r.quantity),
              unit,
            };
          });
        if (recipeRows.length > 0) {
          const { error: recipeErr } = await supabase.from("product_recipes").insert(recipeRows);
          if (recipeErr) throw recipeErr;
        }
      } else if (!hasRecipe && !skipInitialStock) {
        // Producto / materia_prima → primera entrada
        const totalCost = Number(entryTotalCost);
        const restockId = "rs_" + generateId();
        const isPaid = paymentStatus === "paid";
        const supplierName = suppliers.find((s) => s.id === resolvedSupplierId)?.name || newSupplierName.trim();
        // items jsonb es NOT NULL en cantina_restocks. Mismo shape que usa RestockForm.
        const itemsJson = [{
          product_id: newId,
          name: finalName,
          qty: entryUnits,
          cost_per_unit_ref: entryCostPerUnit,
          total_cost_ref: totalCost,
        }];
        const { error: restockErr } = await supabase.from("cantina_restocks").insert({
          id: restockId,
          supplier: supplierName,
          supplier_id: resolvedSupplierId,
          restock_date: entryDate,
          items: itemsJson,
          total_cost_ref: totalCost,
          paid_amount_ref: isPaid ? totalCost : 0,
          payment_status: isPaid ? "paid" : "pending",
          due_date: isPaid ? null : dueDate,
          notes: entryNotes.trim() || null,
          created_by: user?.name || "Cantina",
        });
        if (restockErr) throw restockErr;

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
            name: `Compra ${supplierName}`,
            amount_usd: totalCost,
            payment_method: paymentMethod,
            reference: paymentRef.trim() || null,
            provider: supplierName,
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
            <h2 className="text-base font-bold text-stone-800">
              + Crear {(typeMeta?.label || "Producto").toLowerCase()}
            </h2>
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
              {hasPrice && (
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

              {/* Hint para MP ambigua tipo Tomate */}
              {isMP && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-[11px] text-amber-900 leading-snug">
                  <p className="font-medium mb-1">💡 ¿Tomate, cebolla u otro ingrediente ambiguo?</p>
                  <p>
                    • Si lo cuentas por unidad (10 tomates) → elige <b>u</b> y activa "También se mide por peso" abajo<br />
                    • Si lo compras y usas siempre por peso (carne picada) → elige <b>g</b><br />
                    Cómo viene en la compra (caja, bolsa, kg) lo defines al ingresar el lote.
                  </p>
                </div>
              )}

              {/* Toggle perfil doble: solo MP base=u */}
              {isMP && unitLabel === "u" && (
                <div className="border border-stone-200 rounded-lg p-3 bg-stone-50">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasWeight} onChange={(e) => setHasWeight(e.target.checked)} />
                    <span className="text-sm font-medium text-stone-700">¿También se mide por peso o volumen en recetas?</span>
                  </label>
                  <p className="text-[10px] text-stone-500 mt-1 leading-snug">
                    Sí para Tomate, Cebolla, Pimentón, Lechuga (se cuentan al comprar, pero se pesan al cocinar).
                    No para Pan, Salchicha (siempre por unidad).
                  </p>
                  {hasWeight && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">¿Cuánto pesa 1 unidad?</label>
                        <input
                          type="number" step="1" min="1"
                          value={weightPerUnit}
                          onChange={(e) => setWeightPerUnit(e.target.value)}
                          placeholder="150"
                          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Unidad</label>
                        <select
                          value={weightUnit}
                          onChange={(e) => setWeightUnit(e.target.value)}
                          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
                        >
                          <option value="g">g (gramos)</option>
                          <option value="ml">ml (mililitros)</option>
                        </select>
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
                    // Perfil doble: ingrediente con weight_per_unit ofrece 2 opciones de unidad
                    const unitOptions = ing
                      ? (ing.weight_per_unit && ing.weight_unit
                          ? [ing.unit_label, ing.weight_unit]
                          : [ing.unit_label])
                      : [];
                    const currentUnit = r.unit || ing?.unit_label || "";
                    // Si la unidad elegida no coincide con la base, mostrar conversión auto
                    const showConv = ing?.weight_per_unit && currentUnit === ing.weight_unit && Number(r.quantity) > 0;
                    const qtyInBase = showConv ? Number(r.quantity) / Number(ing.weight_per_unit) : null;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Ingrediente</label>
                            <select
                              value={r.ingredientId}
                              onChange={(e) => {
                                const next = [...recipe];
                                next[idx].ingredientId = e.target.value;
                                next[idx].unit = ""; // reset al cambiar ingrediente
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
                          <div className="w-24">
                            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Cantidad</label>
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
                          <div className="w-20">
                            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Unidad</label>
                            {unitOptions.length > 1 ? (
                              <select
                                value={currentUnit}
                                onChange={(e) => {
                                  const next = [...recipe];
                                  next[idx].unit = e.target.value;
                                  setRecipe(next);
                                }}
                                className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm focus:border-brand focus:outline-none bg-white"
                              >
                                {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            ) : (
                              <div className="w-full border border-stone-200 bg-stone-50 rounded-lg px-2 py-2 text-sm text-stone-500 text-center">
                                {ing?.unit_label || "—"}
                              </div>
                            )}
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
                        {showConv && (
                          <p className="text-[10px] text-stone-400 pl-1">
                            ≈ {qtyInBase.toFixed(3)} {ing.unit_label} (convertido para descontar stock)
                          </p>
                        )}
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

                  {/* "¿En qué viene?" selector — el pack es del LOTE */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">¿En qué viene este lote?</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPackKind("sueltos")}
                        className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${packKind === "sueltos" ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                      >Sueltos<br/><span className="text-[10px] font-normal">({unitLabel})</span></button>
                      <button
                        type="button"
                        disabled={unitLabel !== "g" && unitLabel !== "ml"}
                        onClick={() => setPackKind("mayor")}
                        className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${packKind === "mayor" ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"} disabled:opacity-30 disabled:cursor-not-allowed`}
                        title={unitLabel === "g" ? "kg" : unitLabel === "ml" ? "L" : "Solo aplica si la base es g o ml"}
                      >Mayor<br/><span className="text-[10px] font-normal">({unitLabel === "g" ? "kg" : unitLabel === "ml" ? "L" : "—"})</span></button>
                      <button
                        type="button"
                        onClick={() => setPackKind("pack")}
                        className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors ${packKind === "pack" ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
                      >Pack<br/><span className="text-[10px] font-normal">(caja/bolsa)</span></button>
                    </div>
                  </div>

                  {/* Pack: sub-inputs */}
                  {packKind === "pack" && (
                    <div className="grid grid-cols-2 gap-2 border border-stone-200 rounded-lg p-3 bg-stone-50">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">¿Cuántas {unitLabel} por pack?</label>
                        <input
                          type="number" step="1" min="1"
                          value={packSizeLote}
                          onChange={(e) => setPackSizeLote(e.target.value)}
                          placeholder="12"
                          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Nombre del pack</label>
                        <input
                          type="text"
                          value={packLabelLote}
                          onChange={(e) => setPackLabelLote(e.target.value)}
                          placeholder="caja / bolsa / paq"
                          maxLength={12}
                          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Cantidad + costo total */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">
                        {packKind === "sueltos" && `¿Cuántas ${unitLabel}?`}
                        {packKind === "mayor" && `¿Cuántas ${unitLabel === "g" ? "kg" : "L"}?`}
                        {packKind === "pack" && `¿Cuántas ${packLabelLote || "packs"}?`}
                      </label>
                      <input
                        type="number" step="0.01" min="0.01"
                        value={entryQty}
                        onChange={(e) => setEntryQty(e.target.value)}
                        placeholder={packKind === "pack" ? "1" : "10"}
                        className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                      />
                      {packKind !== "sueltos" && entryUnits > 0 && (
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
