"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, TrendingUp, ShoppingBag, Hash, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PERIODS = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mes" },
  { id: "custom", label: "Rango" },
];

function getDateRange(period, customFrom, customTo) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  switch (period) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      return { from: d.toISOString().split("T")[0], to: today };
    }
    case "month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: first.toISOString().split("T")[0], to: today };
    }
    case "custom":
      return { from: customFrom || today, to: customTo || today };
    default:
      return { from: today, to: today };
  }
}

const METHOD_LABELS = {
  pago_movil: "Pago Móvil",
  cash_bs: "Efectivo Bs",
  cash_usd: "Cash USD",
  zelle: "Zelle",
};

export default function ReportesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [period, setPeriod] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sales, setSales] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem("cantina_user");
    if (!stored) { router.push("/"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { from, to } = getDateRange(period, customFrom, customTo);

    const [salesRes, restocksRes] = await Promise.all([
      supabase
        .from("cantina_sales")
        .select("*")
        .gte("sale_date", from)
        .lte("sale_date", to)
        .order("created_at", { ascending: false }),
      supabase
        .from("restock_purchases")
        .select("*")
        .gte("purchase_date", from)
        .lte("purchase_date", to),
    ]);

    if (salesRes.data) setSales(salesRes.data);
    if (restocksRes.data) setRestocks(restocksRes.data);
    setLoading(false);
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  if (!user) return null;

  // Summary calculations
  const totalRef = sales.reduce((sum, s) => sum + parseFloat(s.total_ref || 0), 0);
  const totalBs = sales.reduce((sum, s) => sum + parseFloat(s.total_bs || 0), 0);
  const salesCount = sales.length;

  // Top product
  const productSales = {};
  sales.forEach((s) => {
    (s.items || []).forEach((item) => {
      const key = item.name || item.product_id;
      if (!productSales[key]) productSales[key] = { name: key, qty: 0, revenue: 0 };
      productSales[key].qty += item.qty;
      productSales[key].revenue += item.price_ref * item.qty;
    });
  });
  const productList = Object.values(productSales).sort((a, b) => b.revenue - a.revenue);
  const topProduct = productList[0];

  // P&L: cost from restock_purchases (weighted average)
  const costMap = {};
  restocks.forEach((r) => {
    if (!r.cost_per_unit_ref) return;
    if (!costMap[r.product_id]) costMap[r.product_id] = { totalCost: 0, totalQty: 0 };
    costMap[r.product_id].totalCost += parseFloat(r.cost_per_unit_ref) * r.quantity;
    costMap[r.product_id].totalQty += r.quantity;
  });

  // Also load historical restock data for cost calculations (all time)
  const plData = productList.map((p) => {
    // Find product_id from sales items
    let productId = null;
    for (const s of sales) {
      const item = (s.items || []).find((i) => i.name === p.name);
      if (item) { productId = item.product_id; break; }
    }

    const cost = productId && costMap[productId]
      ? costMap[productId].totalCost / costMap[productId].totalQty
      : null;

    const totalCost = cost ? cost * p.qty : null;
    const margin = totalCost != null ? p.revenue - totalCost : null;
    const marginPct = margin != null && p.revenue > 0 ? (margin / p.revenue) * 100 : null;

    return { ...p, cost, totalCost, margin, marginPct };
  });

  return (
    <div className="h-screen flex flex-col bg-brand-cream-light overflow-hidden">
      <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between shrink-0">
        <h1 className="font-bold text-brand text-lg flex items-center gap-2">
          <BarChart3 size={20} /> Reportes
        </h1>
        <span className="text-xs text-stone-400">{user.name}</span>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Period selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                period === p.id
                  ? "bg-brand text-white"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-100"
              }`}
            >
              {p.label}
            </button>
          ))}
          {period === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
              <span className="text-stone-400 text-sm">a</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm animate-pulse py-12">Cargando reportes...</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard
                icon={TrendingUp}
                label="Total vendido REF"
                value={`REF ${totalRef.toFixed(2)}`}
                color="text-brand"
              />
              <SummaryCard
                icon={TrendingUp}
                label="Total vendido Bs"
                value={`Bs ${totalBs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                color="text-stone-600"
              />
              <SummaryCard
                icon={Hash}
                label="Número de ventas"
                value={salesCount.toString()}
                color="text-blue-600"
              />
              <SummaryCard
                icon={Star}
                label="Más vendido"
                value={topProduct ? `${topProduct.name} (${topProduct.qty})` : "—"}
                color="text-amber-600"
              />
            </div>

            {/* P&L Table */}
            {plData.length > 0 && (
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100">
                  <h2 className="font-bold text-sm text-stone-700">P&L por Producto</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-stone-50 text-stone-500 text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">Producto</th>
                      <th className="text-center px-4 py-2.5 font-medium">Unidades</th>
                      <th className="text-right px-4 py-2.5 font-medium">Ingreso REF</th>
                      <th className="text-right px-4 py-2.5 font-medium">Costo REF</th>
                      <th className="text-right px-4 py-2.5 font-medium">Margen REF</th>
                      <th className="text-right px-4 py-2.5 font-medium">Margen %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plData.map((row) => (
                      <tr key={row.name} className="border-t border-stone-100 hover:bg-stone-50/50">
                        <td className="px-4 py-2.5 font-medium text-stone-800">{row.name}</td>
                        <td className="px-4 py-2.5 text-center">{row.qty}</td>
                        <td className="px-4 py-2.5 text-right font-medium">REF {row.revenue.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-stone-500">
                          {row.totalCost != null ? `REF ${row.totalCost.toFixed(2)}` : "—"}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${
                          row.margin == null ? "text-stone-400" : row.margin >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"
                        }`}>
                          {row.margin != null ? `REF ${row.margin.toFixed(2)}` : "—"}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${
                          row.marginPct == null ? "text-stone-400" : row.marginPct >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"
                        }`}>
                          {row.marginPct != null ? `${row.marginPct.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sales history */}
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h2 className="font-bold text-sm text-stone-700">Historial de Ventas</h2>
              </div>
              {sales.length === 0 ? (
                <p className="text-center py-8 text-stone-400 text-sm">No hay ventas en este período</p>
              ) : (
                <div className="divide-y divide-stone-100">
                  {sales.map((sale) => (
                    <div key={sale.id} className="px-4 py-3 hover:bg-stone-50/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-stone-400">
                          {new Date(sale.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {new Date(sale.created_at).toLocaleDateString("es-VE")}
                        </span>
                        <span className="text-xs font-medium bg-stone-100 px-2 py-0.5 rounded">
                          {METHOD_LABELS[sale.payment_method] || sale.payment_method}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-stone-600">
                          {(sale.items || []).map((i) => `${i.qty}x ${i.name}`).join(", ")}
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-brand text-sm">REF {parseFloat(sale.total_ref).toFixed(2)}</span>
                          {sale.total_bs && (
                            <span className="text-xs text-stone-400 ml-2">
                              Bs {parseFloat(sale.total_bs).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-stone-400" />
        <span className="text-xs text-stone-500">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color} truncate`}>{value}</p>
    </div>
  );
}
