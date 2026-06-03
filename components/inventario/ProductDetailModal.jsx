"use client";
import { useState, useEffect, useMemo } from "react";
import { X, Loader2, Edit2, Plus, TrendingUp, DollarSign, Calendar, Package, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductImage } from "@/lib/utils";
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip as ChartTooltip, Legend } from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, ChartTooltip, Legend);

// Modal de perfil del producto. MVP: tab Resumen lleno; Ventas/Compras/Recetas
// quedan como placeholder con la estructura armada para iterar.
export default function ProductDetailModal({ product, rate, onClose, onEdit, onAdjust, onRestock }) {
  const [tab, setTab] = useState("resumen");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!product?.id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [salesRes, restocksRes, movRes, recipeRes] = await Promise.all([
        supabase
          .from("cantina_sales")
          .select("id, sale_date, total_ref, items")
          .gte("sale_date", cutoff30.split("T")[0])
          .order("sale_date", { ascending: false })
          .limit(500),
        supabase
          .from("cantina_restocks")
          .select("id, restock_date, total_cost_ref, items, supplier, supplier_id")
          .gte("restock_date", cutoff30.split("T")[0])
          .order("restock_date", { ascending: false })
          .limit(200),
        supabase
          .from("stock_movements")
          .select("created_at, movement_type, quantity, cost_ref")
          .eq("product_id", product.id)
          .order("created_at", { ascending: false })
          .limit(50),
        product.has_recipe
          ? supabase
              .from("product_recipes")
              .select("ingredient_id, quantity, unit")
              .eq("product_id", product.id)
          : Promise.resolve({ data: [] }),
      ]);

      // Filtrar sales/restocks que contengan este producto en items jsonb
      const productInItems = (items, pid) => {
        if (!Array.isArray(items)) return null;
        return items.find((it) => it?.product_id === pid);
      };
      const mySales = (salesRes.data || [])
        .map((s) => ({ ...s, mine: productInItems(s.items, product.id) }))
        .filter((s) => s.mine);
      const myRestocks = (restocksRes.data || [])
        .map((r) => ({ ...r, mine: productInItems(r.items, product.id) }))
        .filter((r) => r.mine);

      // Agrupar ventas por día para el chart
      const dailySales = {};
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        dailySales[key] = 0;
      }
      mySales.forEach((s) => {
        const day = s.sale_date;
        if (dailySales[day] !== undefined) {
          dailySales[day] += Number(s.mine?.qty || 0);
        }
      });

      const totalSold30 = mySales.reduce((sum, s) => sum + Number(s.mine?.qty || 0), 0);
      const revenue30 = mySales.reduce((sum, s) => {
        const item = s.mine;
        return sum + (Number(item?.qty || 0) * Number(item?.unit_price_ref || product.price_ref || 0));
      }, 0);
      const profit30 = revenue30 - (totalSold30 * Number(product.cost_ref || 0));

      const lastSale = mySales[0]?.sale_date || null;
      const lastRestock = myRestocks[0]?.restock_date || null;
      const daysSinceLastSale = lastSale ? Math.floor((today - new Date(lastSale)) / (1000 * 60 * 60 * 24)) : null;
      const daysSinceLastRestock = lastRestock ? Math.floor((today - new Date(lastRestock)) / (1000 * 60 * 60 * 24)) : null;

      // Ingredientes con stock actual (si has_recipe)
      let recipeWithStock = [];
      if (product.has_recipe && recipeRes.data?.length > 0) {
        const ingIds = recipeRes.data.map((r) => r.ingredient_id);
        const { data: ingrs } = await supabase
          .from("products")
          .select("id, name, emoji, stock_quantity, unit_label, cost_ref, weight_per_unit, weight_unit")
          .in("id", ingIds);
        const ingMap = {};
        (ingrs || []).forEach((p) => { ingMap[p.id] = p; });
        recipeWithStock = recipeRes.data.map((r) => {
          const ing = ingMap[r.ingredient_id];
          const isDoubleUnit = ing?.weight_per_unit && r.unit === ing?.weight_unit;
          const qtyInBase = isDoubleUnit ? Number(r.quantity) / Number(ing.weight_per_unit) : Number(r.quantity);
          const possible = ing && Number(ing.stock_quantity) > 0 ? Math.floor(Number(ing.stock_quantity) / qtyInBase) : 0;
          return {
            ...r,
            ingredient: ing,
            qty_in_base: qtyInBase,
            servings_possible: possible,
          };
        });
      }

      if (!alive) return;
      setStats({
        dailySales,
        totalSold30,
        revenue30,
        profit30,
        salesCount30: mySales.length,
        restocksCount30: myRestocks.length,
        lastSale,
        lastRestock,
        daysSinceLastSale,
        daysSinceLastRestock,
        recipeWithStock,
        recentMovements: movRes.data || [],
      });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [product?.id, product?.has_recipe, product?.price_ref, product?.cost_ref]);

  if (!product) return null;

  const margin = useMemo(() => {
    const price = Number(product.price_ref || 0);
    const cost = Number(product.cost_ref || 0);
    if (price <= 0) return null;
    return ((price - cost) / price) * 100;
  }, [product]);

  const typeLabel = ({
    producto: "Producto",
    plato: "Plato",
    bebida_preparada: "Bebida preparada",
    materia_prima: "Materia prima",
    servicio: "Servicio",
  })[product.type] || product.type || "?";

  const formatStock = (n, label) => {
    const num = Number(n || 0);
    if ((label || "").toLowerCase() === "g" && num >= 1000) return `${(num / 1000).toLocaleString("es-VE", { maximumFractionDigits: 2 })} kg`;
    if ((label || "").toLowerCase() === "ml" && num >= 1000) return `${(num / 1000).toLocaleString("es-VE", { maximumFractionDigits: 2 })} L`;
    return `${num.toLocaleString()} ${label || ""}`.trim();
  };

  const chartData = useMemo(() => {
    if (!stats?.dailySales) return null;
    const labels = Object.keys(stats.dailySales).map((d) => {
      const [, m, day] = d.split("-");
      return `${day}/${m}`;
    });
    const data = Object.values(stats.dailySales);
    return {
      labels,
      datasets: [{
        data,
        borderColor: "rgb(120, 30, 50)",
        backgroundColor: "rgba(120, 30, 50, 0.08)",
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      }],
    };
  }, [stats]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 9 }, precision: 0 } },
    },
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-stone-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0">
              <ProductImage product={product} size={48} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-stone-800 truncate">{product.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                <span className="bg-brand/10 text-brand px-1.5 py-0.5 rounded font-medium">{typeLabel}</span>
                <span className="text-stone-500">{product.category || "Sin categoría"}</span>
                {!product.active && <span className="bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded">Inactivo</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg shrink-0">
            <X size={18} className="text-stone-400" />
          </button>
        </div>

        {/* Tabs nav */}
        <div className="px-5 border-b border-stone-100 flex gap-1 overflow-x-auto scrollbar-hide">
          {[
            { id: "resumen", label: "Resumen" },
            { id: "ventas", label: "Ventas" },
            { id: "compras", label: "Compras" },
            ...(product.has_recipe ? [{ id: "receta", label: "Receta" }] : []),
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-bold transition-colors border-b-2 ${
                tab === t.id ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-stone-400" />
            </div>
          ) : tab === "resumen" ? (
            <div className="space-y-4">
              {/* KPIs primarios */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KpiCard
                  label="Stock"
                  value={product.has_recipe ? "—" : formatStock(product.stock_quantity, product.unit_label)}
                  hint={product.has_recipe ? "Por receta" : `Alerta: ${formatStock(product.low_stock_alert || 10, product.unit_label)}`}
                />
                <KpiCard
                  label="Costo $"
                  value={`$${Number(product.cost_ref || 0).toFixed(4).replace(/\.?0+$/, "") || "0"}`}
                  hint={`por ${product.unit_label || "u"}`}
                />
                <KpiCard
                  label="Precio venta $"
                  value={`$${Number(product.price_ref || 0).toFixed(2)}`}
                  hint={product.price_ref > 0 ? "por unidad" : "—"}
                />
                <KpiCard
                  label="Margen"
                  value={margin !== null ? `${margin.toFixed(0)}%` : "—"}
                  hint={margin !== null ? (margin >= 50 ? "saludable" : margin >= 20 ? "ok" : "bajo") : ""}
                  color={margin !== null ? (margin >= 50 ? "green" : margin >= 20 ? "amber" : "red") : "stone"}
                />
              </div>

              {/* KPIs 30d */}
              <div className="bg-stone-50 rounded-xl p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">Últimos 30 días</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Ventas" value={stats?.totalSold30 || 0} hint={`${stats?.salesCount30 || 0} tickets`} />
                  <Stat label="Revenue" value={`$${Number(stats?.revenue30 || 0).toFixed(2)}`} />
                  <Stat label="Profit" value={`$${Number(stats?.profit30 || 0).toFixed(2)}`} color={stats?.profit30 > 0 ? "green" : stats?.profit30 < 0 ? "red" : "stone"} />
                  <Stat label="Restocks" value={stats?.restocksCount30 || 0} hint="entradas" />
                </div>
              </div>

              {/* Line chart ventas por día */}
              {chartData && (
                <div className="bg-white border border-stone-200 rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-2">Ventas por día (últimos 30d)</p>
                  <div className="h-32">
                    <Line data={chartData} options={chartOptions} />
                  </div>
                </div>
              )}

              {/* Info adicional */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InfoCard
                  icon={Calendar}
                  label="Última venta"
                  value={stats?.lastSale ? `${stats.daysSinceLastSale === 0 ? "Hoy" : `hace ${stats.daysSinceLastSale}d`}` : "—"}
                  hint={stats?.lastSale ? new Date(stats.lastSale).toLocaleDateString("es-VE") : "Nunca se ha vendido"}
                  warning={stats?.daysSinceLastSale && stats.daysSinceLastSale > 30}
                />
                <InfoCard
                  icon={Package}
                  label="Último restock"
                  value={stats?.lastRestock ? `${stats.daysSinceLastRestock === 0 ? "Hoy" : `hace ${stats.daysSinceLastRestock}d`}` : "—"}
                  hint={stats?.lastRestock ? new Date(stats.lastRestock).toLocaleDateString("es-VE") : "Sin restocks"}
                />
              </div>

              {/* Ingredientes (si has_recipe) */}
              {product.has_recipe && stats?.recipeWithStock?.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-stone-50 border-b border-stone-100">
                    <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">Ingredientes y disponibilidad</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-stone-50 text-stone-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Ingrediente</th>
                        <th className="text-right px-3 py-2 font-medium">Cant/receta</th>
                        <th className="text-right px-3 py-2 font-medium">Stock</th>
                        <th className="text-right px-3 py-2 font-medium">Porciones posibles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recipeWithStock.map((r, i) => (
                        <tr key={i} className="border-t border-stone-100">
                          <td className="px-3 py-2">
                            {r.ingredient?.emoji ? `${r.ingredient.emoji} ` : ""}
                            {r.ingredient?.name || "(eliminado)"}
                          </td>
                          <td className="px-3 py-2 text-right">{r.quantity} {r.unit}</td>
                          <td className="px-3 py-2 text-right">
                            {r.ingredient ? formatStock(r.ingredient.stock_quantity, r.ingredient.unit_label) : "—"}
                          </td>
                          <td className={`px-3 py-2 text-right font-bold ${
                            r.servings_possible <= 0 ? "text-red-600" : r.servings_possible <= 5 ? "text-amber-600" : "text-green-700"
                          }`}>
                            {r.servings_possible}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : tab === "ventas" ? (
            <div className="py-12 text-center text-stone-400 text-sm">
              <TrendingUp size={32} className="mx-auto mb-2 opacity-50" />
              <p>Tab Ventas — próximamente</p>
              <p className="text-xs mt-1">Historial detallado de ventas, top clientes, evolución de precio venta.</p>
            </div>
          ) : tab === "compras" ? (
            <div className="py-12 text-center text-stone-400 text-sm">
              <DollarSign size={32} className="mx-auto mb-2 opacity-50" />
              <p>Tab Compras — próximamente</p>
              <p className="text-xs mt-1">Restocks históricos, proveedores y precio por proveedor, evolución MAC.</p>
            </div>
          ) : tab === "receta" ? (
            <div className="py-12 text-center text-stone-400 text-sm">
              <Package size={32} className="mx-auto mb-2 opacity-50" />
              <p>Tab Receta — próximamente</p>
              <p className="text-xs mt-1">Editor de receta + costo computado + simulador de margen.</p>
            </div>
          ) : null}
        </div>

        {/* Footer acciones */}
        <div className="border-t border-stone-100 px-5 py-3 flex gap-2 flex-wrap">
          {onEdit && (
            <button
              onClick={() => onEdit(product)}
              className="flex-1 min-w-[120px] py-2 rounded-lg border-2 border-stone-200 text-stone-700 font-medium text-xs hover:bg-stone-50 flex items-center justify-center gap-1"
            >
              <Edit2 size={12} /> Editar
            </button>
          )}
          {onAdjust && !product.has_recipe && (
            <button
              onClick={() => onAdjust(product)}
              className="flex-1 min-w-[120px] py-2 rounded-lg border-2 border-stone-200 text-stone-700 font-medium text-xs hover:bg-stone-50 flex items-center justify-center gap-1"
            >
              <Package size={12} /> Ajustar stock
            </button>
          )}
          {onRestock && !product.has_recipe && (
            <button
              onClick={() => onRestock(product)}
              className="flex-1 min-w-[120px] py-2 rounded-lg bg-brand text-white font-bold text-xs hover:bg-brand-dark flex items-center justify-center gap-1"
            >
              <Plus size={12} /> Registrar entrada
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint, color = "stone" }) {
  const colorMap = {
    stone: "text-stone-800",
    green: "text-green-700",
    amber: "text-amber-700",
    red: "text-red-600",
  };
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">{label}</p>
      <p className={`text-lg font-extrabold mt-0.5 ${colorMap[color]}`}>{value}</p>
      {hint && <p className="text-[10px] text-stone-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Stat({ label, value, hint, color = "stone" }) {
  const colorMap = {
    stone: "text-stone-800",
    green: "text-green-700",
    red: "text-red-600",
  };
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${colorMap[color]}`}>{value}</p>
      {hint && <p className="text-[10px] text-stone-400">{hint}</p>}
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, hint, warning }) {
  return (
    <div className={`bg-white border rounded-xl p-3 flex items-start gap-3 ${warning ? "border-amber-300 bg-amber-50/30" : "border-stone-200"}`}>
      <Icon size={16} className={warning ? "text-amber-600 mt-0.5" : "text-stone-400 mt-0.5"} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">{label}</p>
        <p className="text-sm font-bold text-stone-800 mt-0.5">{value}</p>
        {hint && <p className="text-[10px] text-stone-400 mt-0.5">{hint}</p>}
      </div>
      {warning && <AlertCircle size={14} className="text-amber-600 shrink-0" />}
    </div>
  );
}
