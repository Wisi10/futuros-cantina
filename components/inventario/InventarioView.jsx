"use client";
import { useState, useEffect, useCallback } from "react";
import { Package, Search, AlertTriangle, Plus, Minus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF } from "@/lib/utils";
import StockAdjustModal from "./StockAdjustModal";
import RestockForm from "./RestockForm";

export default function InventarioView({ user }) {
  const [subTab, setSubTab] = useState("stock");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState(null);

  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_cantina", true)
      .order("stock_quantity", { ascending: true });
    if (data) setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalValue = filtered.reduce(
    (sum, p) => sum + Number(p.stock_quantity || 0) * Number(p.cost_ref || 0), 0
  );

  const rowBg = (p) => {
    const stock = Number(p.stock_quantity || 0);
    if (stock <= 0) return "bg-red-50";
    if (stock <= (p.low_stock_alert || 5)) return "bg-yellow-50";
    return "";
  };

  const stockBadge = (p) => {
    const stock = Number(p.stock_quantity || 0);
    if (stock <= 0) return <span className="text-xs font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Sin stock</span>;
    if (stock <= (p.low_stock_alert || 5)) return <span className="text-xs font-medium text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">Bajo</span>;
    return <span className="text-xs font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">OK</span>;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-3 shrink-0">
        <h1 className="font-bold text-brand text-lg flex items-center gap-2 mb-4">
          <Package size={20} /> Inventario
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setSubTab("stock")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === "stock" ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            Stock actual
          </button>
          <button
            onClick={() => setSubTab("entrada")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === "entrada" ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            Registrar entrada
          </button>
        </div>
      </div>

      {/* Sub-tab content */}
      {subTab === "stock" && (
        <div className="flex-1 overflow-auto px-6 pb-6">
          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
            />
          </div>

          {loading ? (
            <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando...</p>
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 text-xs">
                    <th className="text-left px-3 py-2 font-medium">Producto</th>
                    <th className="text-left px-3 py-2 font-medium">Categoría</th>
                    <th className="text-right px-3 py-2 font-medium">Stock</th>
                    <th className="text-right px-3 py-2 font-medium">Alerta</th>
                    <th className="text-right px-3 py-2 font-medium">Costo REF</th>
                    <th className="text-right px-3 py-2 font-medium">Valor REF</th>
                    <th className="text-center px-3 py-2 font-medium">Estado</th>
                    <th className="text-right px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className={`border-t border-stone-100 ${rowBg(p)}`}>
                      <td className="px-3 py-2 font-medium text-stone-800">
                        <span className="mr-1.5">{p.emoji || "🍽️"}</span>{p.name}
                      </td>
                      <td className="px-3 py-2 text-stone-500">{p.category || "—"}</td>
                      <td className="px-3 py-2 text-right font-bold">{Number(p.stock_quantity || 0)}</td>
                      <td className="px-3 py-2 text-right text-stone-400">{p.low_stock_alert || 5}</td>
                      <td className="px-3 py-2 text-right text-stone-500">{Number(p.cost_ref || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {(Number(p.stock_quantity || 0) * Number(p.cost_ref || 0)).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">{stockBadge(p)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setAdjusting(p)}
                          className="text-xs text-brand hover:underline"
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50">
                    <td colSpan={5} className="px-3 py-2 text-sm font-bold text-stone-700 text-right">
                      Valor total inventario:
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-brand">
                      REF {totalValue.toFixed(2)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === "entrada" && (
        <div className="flex-1 overflow-auto px-6 pb-6">
          <RestockForm products={products} user={user} onRestocked={loadProducts} />
        </div>
      )}

      {/* Adjust modal */}
      {adjusting && (
        <StockAdjustModal
          product={adjusting}
          user={user}
          onClose={() => setAdjusting(null)}
          onSaved={() => { setAdjusting(null); loadProducts(); }}
        />
      )}
    </div>
  );
}
