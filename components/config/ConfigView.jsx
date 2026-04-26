"use client";
import { useState, useEffect, useCallback } from "react";
import { Settings, Save, RefreshCw, History, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductImage } from "@/lib/utils";

export default function ConfigView({ user, rate, onRateUpdated }) {
  const [products, setProducts] = useState([]);
  const [rateHistory, setRateHistory] = useState([]);
  const [eurInput, setEurInput] = useState("");
  const [usdInput, setUsdInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("products").select("*").order("sort_order");
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
  }, [loadProducts, loadRateHistory]);

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
    if (!error) loadProducts();
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
    <div className="h-full overflow-auto p-6 space-y-6">
      <h1 className="font-bold text-brand text-lg flex items-center gap-2">
        <Settings size={20} /> Configuracion
      </h1>

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

      {/* Products Section */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100">
          <h2 className="font-bold text-sm text-stone-700">Productos</h2>
          <p className="text-xs text-stone-400">Activa "Cantina" para que aparezcan en el POS</p>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-stone-400 animate-pulse">Cargando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium">Producto</th>
                <th className="text-center px-3 py-2 font-medium">Cantina</th>
                <th className="text-center px-3 py-2 font-medium">Activo</th>
                <th className="text-right px-3 py-2 font-medium">Precio REF</th>
                <th className="text-right px-3 py-2 font-medium">Costo REF</th>
                <th className="text-center px-3 py-2 font-medium">Emoji</th>
                <th className="text-right px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
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
                  <td className="px-3 py-2 text-center"><ProductImage product={p} size={24} /></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditingProduct(p)}
                      className="text-xs text-brand hover:underline">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(product, {
      name,
      price_ref: parseFloat(priceRef) || 0,
      cost_ref: parseFloat(costRef) || 0,
      emoji,
      category,
      low_stock_alert: parseInt(alert) || 5,
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-3 gap-3">
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
