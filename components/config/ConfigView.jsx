"use client";
import { useState, useEffect, useCallback } from "react";
import { Settings, Save, RefreshCw, History, X, Package, Tag, Percent, Users, ChevronRight, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductImage, calculateProfitability } from "@/lib/utils";
import CategoriesEditor from "./CategoriesEditor";
import DescuentosCantinaEditor from "./DescuentosCantinaEditor";
import EmpleadosEditor from "./EmpleadosEditor";

const SECTIONS = [
  { id: "tasa",        name: "Tasa del dia",   icon: RefreshCw },
  { id: "categorias",  name: "Categorias",     icon: Tag },
  { id: "descuentos",  name: "Descuentos",     icon: Percent },
  { id: "empleados",   name: "Empleados",      icon: Users },
  { id: "stock",       name: "Umbral stock",   icon: Package },
  { id: "productos",   name: "Productos",      icon: ShoppingBag },
];

export default function ConfigView({ user, rate, onRateUpdated }) {
  const [section, setSection] = useState("tasa");
  const [products, setProducts] = useState([]);
  const [rateHistory, setRateHistory] = useState([]);
  const [eurInput, setEurInput] = useState("");
  const [stockThresholdInput, setStockThresholdInput] = useState("");
  const [stockThresholdSaved, setStockThresholdSaved] = useState(null);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [usdInput, setUsdInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("products").select("*").order("name", { ascending: true });
    if (data) setProducts(data);
    setLoading(false);
  }, []);

  const loadRateHistory = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("exchange_rates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(7);
    if (data) setRateHistory(data);
  }, []);

  useEffect(() => {
    loadProducts();
    loadRateHistory();
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "low_stock_threshold")
        .single();
      const v = Number(data?.value?.value) || 5;
      setStockThresholdSaved(v);
      setStockThresholdInput(String(v));
    })();
  }, [loadProducts, loadRateHistory]);

  const saveStockThreshold = async () => {
    if (savingThreshold) return;
    const n = Number(stockThresholdInput);
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      alert("Ingresa un numero entre 1 y 100");
      return;
    }
    setSavingThreshold(true);
    const { error } = await supabase.from("app_settings").upsert({
      key: "low_stock_threshold",
      value: { value: n },
      updated_by: user?.name || "Cantina",
    }, { onConflict: "key" });
    setSavingThreshold(false);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    setStockThresholdSaved(n);
    alert("Umbral guardado. Recarga la pagina para que aplique en POS.");
  };

  // Pre-fill rate inputs with latest values
  useEffect(() => {
    if (rate && !eurInput && !usdInput) {
      setEurInput(rate.eur.toFixed(2));
      setUsdInput(rate.usd.toFixed(2));
    }
  }, [rate]);

  const toggleCantina = async (product) => {
    const { error } = await supabase
      .from("products")
      .update({ is_cantina: !product.is_cantina })
      .eq("id", product.id);
    if (error) {
      alert("No se pudo guardar el cambio. Intenta de nuevo.");
      return;
    }
    loadProducts();
  };

  const toggleActive = async (product) => {
    const { error } = await supabase
      .from("products")
      .update({ active: !product.active })
      .eq("id", product.id);
    if (!error) loadProducts();
  };

  const saveProduct = async (product, updates) => {
    const { error } = await supabase.from("products").update(updates).eq("id", product.id);
    if (!error) { setEditingProduct(null); loadProducts(); }
  };

  const saveRate = async () => {
    const eur = parseFloat(eurInput);
    const usd = parseFloat(usdInput);
    if (!eur || !usd || eur <= 0 || usd <= 0) return;
    setSavingRate(true);
    await supabase.from("exchange_rates").insert({
      eur_rate: eur,
      usd_rate: usd,
      updated_by_name: user?.name || "Cantina",
    });
    setEurInput("");
    setUsdInput("");
    setSavingRate(false);
    loadRateHistory();
    if (onRateUpdated) onRateUpdated();
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <h1 className="font-bold text-brand text-lg flex items-center gap-2 mb-4">
        <Settings size={20} /> Configuracion
      </h1>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Sidebar */}
        <div className="md:w-48 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors whitespace-nowrap shrink-0 md:shrink md:whitespace-normal md:w-full ${
                    active ? "bg-brand-cream-light text-brand font-medium" : "hover:bg-stone-100 text-stone-600"
                  }`}
                >
                  <Icon size={14} />
                  {s.name}
                  {active && <ChevronRight size={12} className="ml-auto hidden md:block" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
      <div style={{ display: section === "tasa" ? undefined : "none" }}>
      {/* Rate Section */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h2 className="font-bold text-sm text-stone-700 mb-3 flex items-center gap-2">
          <RefreshCw size={14} /> Tasa del dia
        </h2>
        {rate ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-sm">
            <span className="font-bold text-green-800">Tasa activa:</span>{" "}
            1 REF = {rate.eur.toFixed(2)} Bs · 1 USD = {rate.usd.toFixed(2)} Bs
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-sm text-yellow-800">
            No hay tasa configurada hoy. Ingresa una:
          </div>
        )}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-stone-500 block mb-1">REF/Bs</label>
            <input type="number" step="0.01" value={eurInput} onChange={(e) => setEurInput(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" placeholder="Ej: 491.49" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-stone-500 block mb-1">USD/Bs</label>
            <input type="number" step="0.01" value={usdInput} onChange={(e) => setUsdInput(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" placeholder="Ej: 425.67" />
          </div>
          <button onClick={saveRate} disabled={savingRate || !eurInput || !usdInput}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-brand-dark">
            {savingRate ? "..." : "Guardar"}
          </button>
        </div>
        {rateHistory.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-stone-500 flex items-center gap-1 mb-1"><History size={10} /> Ultimas 7</p>
            <div className="space-y-1">
              {rateHistory.map((r) => (
                <div key={r.id} className="flex justify-between text-xs bg-stone-50 rounded px-2 py-1">
                  <span>REF {Number(r.eur_rate).toFixed(2)} · USD {Number(r.usd_rate).toFixed(2)}</span>
                  <span className="text-stone-400">
                    {r.updated_by_name && `${r.updated_by_name} · `}
                    {new Date(r.created_at).toLocaleDateString("es-VE")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>

      <div style={{ display: section === "categorias" ? undefined : "none" }}>
        <CategoriesEditor user={user} />
      </div>

      <div style={{ display: section === "descuentos" ? undefined : "none" }}>
        <DescuentosCantinaEditor user={user} />
      </div>

      <div style={{ display: section === "empleados" ? undefined : "none" }}>
        <EmpleadosEditor user={user} />
      </div>

      <div style={{ display: section === "stock" ? undefined : "none" }}>
      {/* Stock Threshold Section */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h2 className="font-bold text-sm text-stone-700 mb-2 flex items-center gap-2">
          <Package size={14} /> Umbral stock bajo
        </h2>
        <p className="text-xs text-stone-500 mb-3">
          Productos con stock menor o igual a este numero salen marcados como "Quedan X" en POS.
          Override per-producto disponible en cada row.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            value={stockThresholdInput}
            onChange={(e) => setStockThresholdInput(e.target.value)}
            className="w-24 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <button
            onClick={saveStockThreshold}
            disabled={savingThreshold || Number(stockThresholdInput) === stockThresholdSaved}
            className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark disabled:opacity-40"
          >
            {savingThreshold ? "Guardando..." : "Guardar"}
          </button>
          {stockThresholdSaved != null && (
            <span className="text-xs text-stone-400">Actual: {stockThresholdSaved}</span>
          )}
        </div>
      </div>
      </div>

      <div style={{ display: section === "productos" ? undefined : "none" }}>
      {/* Products Section */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100">
          <h2 className="font-bold text-sm text-stone-700">Productos</h2>
          <p className="text-xs text-stone-400">Activa "Cantina" para que aparezcan en el POS</p>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-stone-400 animate-pulse">Cargando...</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium">Producto</th>
                <th className="text-center px-3 py-2 font-medium" title="Cuenta para deuda intercompania con el complejo">Es cantina</th>
                <th className="text-center px-3 py-2 font-medium">Activo</th>
                <th className="text-right px-3 py-2 font-medium">Precio REF</th>
                <th className="text-right px-3 py-2 font-medium">Costo REF</th>
                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">Margen</th>
                <th className="text-center px-3 py-2 font-medium">Emoji</th>
                <th className="text-center px-3 py-2 font-medium">Canjeable</th>
                <th className="text-right px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const profit = calculateProfitability(p.price_ref, p.cost_ref);
                return (
                <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                  <td className="px-3 py-2 font-medium text-stone-800">{p.name}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => toggleCantina(p)}
                      className={`w-10 h-5 rounded-full transition-colors ${p.is_cantina ? "bg-brand" : "bg-stone-300"}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${p.is_cantina ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => toggleActive(p)}
                      className={`w-10 h-5 rounded-full transition-colors ${p.active ? "bg-green-500" : "bg-stone-300"}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${p.active ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">{Number(p.price_ref).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-stone-500">{Number(p.cost_ref || 0).toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right text-xs hidden md:table-cell font-medium ${profit.color}`}>{profit.display}</td>
                  <td className="px-3 py-2 text-center"><ProductImage product={p} size={24} /></td>
                  <td className="px-3 py-2 text-center text-xs">
                    {p.is_redeemable ? (
                      <span className="text-gold font-medium">🎁 {p.redemption_cost_points}pts</span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditingProduct(p)}
                      className="text-xs text-brand hover:underline">Editar</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
      </div>

        </div>
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} onSave={saveProduct} />
      )}
    </div>
  );
}

function EditProductModal({ product, onClose, onSave }) {
  const [name, setName] = useState(product.name || "");
  const [priceRef, setPriceRef] = useState(product.price_ref?.toString() || "");
  const [costRef, setCostRef] = useState(product.cost_ref?.toString() || "0");
  const [emoji, setEmoji] = useState(product.emoji || "🍽️");
  const [category, setCategory] = useState(product.category || "");
  const [alert, setAlert] = useState(product.low_stock_alert?.toString() || "5");
  const [isRedeemable, setIsRedeemable] = useState(!!product.is_redeemable);
  const [redemptionCost, setRedemptionCost] = useState(product.redemption_cost_points?.toString() || "");
  const [saving, setSaving] = useState(false);
  const [validationErr, setValidationErr] = useState("");

  const suggestedPoints = Math.floor((parseFloat(priceRef) || 0) * 10);

  const handleSave = async () => {
    if (isRedeemable && (!redemptionCost || parseInt(redemptionCost) <= 0)) {
      setValidationErr("Costo en puntos es obligatorio y debe ser mayor a 0");
      return;
    }
    setValidationErr("");
    setSaving(true);
    await onSave(product, {
      name,
      price_ref: parseFloat(priceRef) || 0,
      cost_ref: parseFloat(costRef) || 0,
      emoji,
      category,
      low_stock_alert: parseInt(alert) || 5,
      is_redeemable: isRedeemable,
      redemption_cost_points: isRedeemable ? parseInt(redemptionCost) : null,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 className="font-bold text-sm">Editar — {product.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-200 rounded"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Nombre</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Precio REF</label>
              <input type="number" step="0.01" value={priceRef} onChange={(e) => setPriceRef(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Costo REF</label>
              <input type="number" step="0.01" value={costRef} onChange={(e) => setCostRef(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Emoji</label>
              <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-center text-xl focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Categoria</label>
              <input type="text" value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Alerta stock</label>
              <input type="number" value={alert} onChange={(e) => setAlert(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            </div>
          </div>

          {/* Loyalty section */}
          <div className="border-t border-stone-200 pt-3 mt-1">
            <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium mb-2">Programa de lealtad</p>
            <div className="flex items-center gap-3 mb-2">
              <button type="button" onClick={() => { setIsRedeemable(!isRedeemable); setValidationErr(""); }}
                className={`w-10 h-5 rounded-full transition-colors ${isRedeemable ? "bg-gold" : "bg-stone-300"}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${isRedeemable ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-xs text-stone-600">Canjeable con puntos</span>
            </div>
            {isRedeemable && (
              <div className="ml-1 space-y-1.5">
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1">Costo en puntos</label>
                  <input type="number" min="1" value={redemptionCost} onChange={(e) => { setRedemptionCost(e.target.value); setValidationErr(""); }}
                    placeholder="Ej: 50"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-gold focus:outline-none" />
                </div>
                {suggestedPoints > 0 && (
                  <p className="text-[10px] text-stone-400">
                    Acumular este producto cuesta {suggestedPoints} puntos (REF {(parseFloat(priceRef) || 0).toFixed(2)} x 10)
                  </p>
                )}
              </div>
            )}
            {validationErr && <p className="text-xs text-red-500 mt-1">{validationErr}</p>}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-stone-200 flex gap-2">
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-brand text-white rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1">
            {saving ? "..." : <><Save size={14} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
