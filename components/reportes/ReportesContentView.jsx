"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { METHOD_LABELS, PAYMENT_METHODS, formatREF, formatBs } from "@/lib/utils";
import CreditsModal from "@/components/vender/CreditsModal";
import ClientProfileModal from "@/components/clientes/ClientProfileModal";
import SalesLineChart from "./SalesLineChart";
import TopProductsBarChart from "./TopProductsBarChart";
import HoursHeatmap from "./HoursHeatmap";
import TopClientsList from "./TopClientsList";
import * as XLSX from "xlsx";

// ─── Heat Map Component ────────────────────────────────────

const HEAT_DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const HEAT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const DAY_MAP = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function fmtHourLabel(h) {
  if (h === 0 || h === 12) return `${h === 0 ? 12 : 12}p`;
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function HeatMap({ sales, loading, rate }) {
  const { grid, maxVal } = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(14).fill(0));
    let max = 0;
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Caracas",
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
    (sales || []).forEach((s) => {
      const parts = fmt.formatToParts(new Date(s.created_at));
      const weekday = parts.find((p) => p.type === "weekday").value;
      const hour = parseInt(parts.find((p) => p.type === "hour").value);
      const dayIdx = DAY_MAP[weekday];
      const hourIdx = hour - 8;
      if (dayIdx == null || hourIdx < 0 || hourIdx >= 14) return;
      g[dayIdx][hourIdx] += Number(s.total_ref || 0);
      if (g[dayIdx][hourIdx] > max) max = g[dayIdx][hourIdx];
    });
    return { grid: g, maxVal: max };
  }, [sales]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-4 mt-4">
        <p className="text-xs text-stone-500 mb-3 font-medium">Mapa de calor — ultimos 30 dias</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: "60px repeat(14, 1fr)" }}>
          {Array.from({ length: 7 * 15 }, (_, i) => (
            <div key={i} className={`rounded ${i % 15 === 0 ? "h-6" : "h-6 bg-stone-100 animate-pulse"}`} />
          ))}
        </div>
      </div>
    );
  }

  const hasData = maxVal > 0;

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 mt-4">
      <p className="text-xs text-stone-500 mb-3 font-medium">Mapa de calor — ultimos 30 dias (REF por franja)</p>

      {!hasData ? (
        <p className="text-xs text-stone-400 text-center py-6">Sin datos suficientes en los ultimos 30 dias</p>
      ) : (
        <div className="overflow-x-auto">
          {/* Header row */}
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: "60px repeat(14, 1fr)", minWidth: 600 }}>
            <div />
            {HEAT_HOURS.map((h) => (
              <div key={h} className="text-center text-[10px] text-stone-400 font-medium pb-1">{fmtHourLabel(h)}</div>
            ))}

            {/* Data rows */}
            {HEAT_DAYS.map((day, dayIdx) => (
              <React.Fragment key={day}>
                <div className="text-[11px] text-stone-500 font-medium flex items-center">{day}</div>
                {HEAT_HOURS.map((h, hourIdx) => {
                  const val = grid[dayIdx][hourIdx];
                  const opacity = val > 0 ? 0.15 + (val / maxVal) * 0.85 : 0;
                  const bg = val > 0
                    ? `rgba(184, 150, 62, ${opacity})`
                    : "rgba(0,0,0,0.03)";
                  const tooltip = val > 0
                    ? `${day} ${fmtHourLabel(h)} — ${formatREF(val)}${rate?.eur ? ` (${formatBs(val, rate.eur)})` : ""}`
                    : `${day} ${fmtHourLabel(h)} — Sin ventas`;
                  return (
                    <div
                      key={hourIdx}
                      title={tooltip}
                      className="rounded-sm cursor-default transition-colors"
                      style={{ backgroundColor: bg, height: 28 }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-2 mt-2">
            <span className="text-[9px] text-stone-400">Menos</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((op) => (
              <div key={op} className="w-4 h-3 rounded-sm" style={{ backgroundColor: `rgba(184, 150, 62, ${op})` }} />
            ))}
            <span className="text-[9px] text-stone-400">Mas</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KPI Card with comparison badge ───────────────────────

function KpiCard({ label, value, sub, change, hasPrev, partial, count, color }) {
  const showComparison = typeof change === "number" || hasPrev === true;
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <p className="text-xs text-stone-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color || "text-stone-800"}`}>{value}</p>
      {sub && <p className="text-[10px] text-stone-400">{sub}</p>}
      {count && <p className="text-[10px] text-stone-400">{count}</p>}
      {showComparison && (typeof change === "number" ? (
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[10px] font-medium ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
            {change >= 0 ? "▲" : "▼"} {change >= 0 ? "+" : ""}{change.toFixed(1)}% vs anterior
          </span>
          {partial && <span className="text-[9px] text-stone-400">(parcial)</span>}
        </div>
      ) : hasPrev === true ? (
        <p className="text-[10px] text-stone-400 mt-0.5">Sin datos del periodo anterior</p>
      ) : null)}
    </div>
  );
}

// ─── Report Periods ────────────────────────────────────────

const PERIODS = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "custom", label: "Personalizado" },
];

function getPeriodDates(period, customFrom, customTo) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  if (period === "hoy") return { from: todayStr, to: todayStr };
  if (period === "semana") {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    return { from: d.toISOString().split("T")[0], to: todayStr };
  }
  if (period === "mes") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: first.toISOString().split("T")[0], to: todayStr };
  }
  return { from: customFrom || todayStr, to: customTo || todayStr };
}

export default function ReportesContentView({ user, rate }) {
  const [period, setPeriod] = useState("hoy");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(true);

  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [credits, setCredits] = useState([]);
  const [products, setProducts] = useState([]);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [heatSales, setHeatSales] = useState([]);
  const [heatLoading, setHeatLoading] = useState(true);

  const [prevSales, setPrevSales] = useState([]);
  const [allTimeSales, setAllTimeSales] = useState([]);
  const [slowMoverSales, setSlowMoverSales] = useState([]);
  const [voidedCount, setVoidedCount] = useState(0);

  const [methodPayments, setMethodPayments] = useState([]);

  // New charts (sprint 12)
  const [salesByDay, setSalesByDay] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [salesHeatmap, setSalesHeatmap] = useState([]);
  const [topClients, setTopClients] = useState([]);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [profileClientId, setProfileClientId] = useState(null);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
    const { from, to } = getPeriodDates(period, customFrom, customTo);

    // Calculate previous period dates
    const periodDays = Math.max(1, Math.ceil((new Date(to + "T23:59:59") - new Date(from)) / 86400000) + 1);
    const prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - periodDays + 1);
    const prevFromStr = prevFrom.toISOString().split("T")[0];
    const prevToStr = prevTo.toISOString().split("T")[0];

    // Slow movers: last 14 days
    const fourteenAgo = new Date();
    fourteenAgo.setDate(fourteenAgo.getDate() - 14);
    const fourteenStr = fourteenAgo.toISOString().split("T")[0];

    const [salesRes, expRes, creditsRes, prodsRes, prevRes, slowRes, oldestRes, voidedRes] = await Promise.all([
      supabase.from("cantina_sales").select("*").gte("sale_date", from).lte("sale_date", to).is("voided_at", null).order("created_at", { ascending: false }),
      supabase.from("cantina_expenses").select("*").gte("expense_date", from).lte("expense_date", to),
      supabase.from("cantina_credits").select("*").in("status", ["pending", "partial"]),
      supabase.from("products").select("*").eq("is_cantina", true),
      supabase.from("cantina_sales").select("total_ref, items").gte("sale_date", prevFromStr).lte("sale_date", prevToStr).is("voided_at", null),
      supabase.from("cantina_sales").select("items, created_at").gte("sale_date", fourteenStr).is("voided_at", null),
      supabase.from("cantina_sales").select("created_at").is("voided_at", null).order("created_at", { ascending: true }).limit(1),
      supabase.from("cantina_sales").select("id", { count: "exact", head: true }).gte("sale_date", from).lte("sale_date", to).not("voided_at", "is", null),
    ]);

    if (salesRes.data) setSales(salesRes.data);
    if (expRes.data) setExpenses(expRes.data);
    if (creditsRes.data) setCredits(creditsRes.data);
    if (prodsRes.data) setProducts(prodsRes.data);
    setPrevSales(prevRes.data || []);
    setSlowMoverSales(slowRes.data || []);
    setAllTimeSales(oldestRes.data || []);
    setVoidedCount(voidedRes.count || 0);

    // Sale payments for period (sprint 7B)
    const periodSaleIds = (salesRes.data || []).map((s) => s.id);
    if (periodSaleIds.length > 0) {
      const { data: spData } = await supabase
        .from("cantina_sale_payments")
        .select("sale_id, payment_method, amount_ref, is_change")
        .in("sale_id", periodSaleIds);
      setMethodPayments(spData || []);
    } else {
      setMethodPayments([]);
    }
    setLoading(false);

    // Heat map: last 30 days (independent of period selector)
    setHeatLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: heatData } = await supabase
      .from("cantina_sales")
      .select("created_at, total_ref")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .is("voided_at", null)
      .order("created_at", { ascending: false });
    setHeatSales(heatData || []);
    setHeatLoading(false);
    } catch (err) {
      console.error("[REPORTES] loadData error:", err);
      setLoading(false);
      setHeatLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load chart data via new RPCs whenever period changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      setChartsLoading(true);
      const { from, to } = getPeriodDates(period, customFrom, customTo);
      const [byDay, topProd, heat, topCli] = await Promise.all([
        supabase.rpc("get_sales_by_day", { p_start: from, p_end: to }),
        supabase.rpc("get_top_products", { p_start: from, p_end: to, p_limit: 10 }),
        supabase.rpc("get_sales_heatmap", { p_start: from, p_end: to }),
        supabase.rpc("get_top_clients", { p_start: from, p_end: to, p_limit: 5 }),
      ]);
      if (cancelled) return;
      setSalesByDay(byDay.data || []);
      setTopProducts(topProd.data || []);
      setSalesHeatmap(heat.data || []);
      setTopClients(topCli.data || []);
      setChartsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [period, customFrom, customTo]);

  // KPIs
  const totalSalesRef = sales.reduce((s, v) => s + Number(v.total_ref || 0), 0);
  const totalExpRef = expenses.reduce((s, e) => s + Number(e.amount_ref || 0), 0);
  const totalCreditsOutstanding = credits.reduce(
    (s, c) => s + Number(c.original_amount_ref || 0) - Number(c.paid_amount_ref || 0), 0
  );
  const utilidad = totalSalesRef - totalExpRef;

  // New metrics
  const activeSales = sales.filter(s => !s.voided_at);
  const voidedSales = sales.length - activeSales.length; // sales already filtered by voided_at IS NULL in query, but voided count needs separate approach
  const ticketPromedio = activeSales.length > 0 ? totalSalesRef / activeSales.length : 0;
  const totalItems = activeSales.reduce((s, v) => s + (v.items || []).reduce((a, i) => a + (i.qty || 0), 0), 0);
  const itemsPorVenta = activeSales.length > 0 ? totalItems / activeSales.length : 0;

  // Comparativa vs periodo anterior
  const prevTotalRef = prevSales.reduce((s, v) => s + Number(v.total_ref || 0), 0);
  const prevCount = prevSales.length;
  const prevTicket = prevCount > 0 ? prevTotalRef / prevCount : 0;
  const hasPrevData = prevSales.length > 0;
  const oldestSaleDate = allTimeSales[0]?.created_at ? new Date(allTimeSales[0].created_at) : null;
  const { from: periodFrom } = getPeriodDates(period, customFrom, customTo);
  const periodDays = Math.max(1, Math.ceil((new Date() - new Date(periodFrom)) / 86400000));
  const historyDays = oldestSaleDate ? Math.floor((new Date() - oldestSaleDate) / 86400000) : 0;
  const isPartialData = historyDays > 0 && historyDays < periodDays * 2;

  const pctChange = (curr, prev) => prev > 0 ? ((curr - prev) / prev * 100) : null;
  const salesChangePct = pctChange(totalSalesRef, prevTotalRef);
  const countChangePct = pctChange(activeSales.length, prevCount);
  const ticketChangePct = pctChange(ticketPromedio, prevTicket);

  // Cancelacion: query ALL sales including voided for this period
  // Since our main query filters voided_at IS NULL, we need the voided count from a separate source
  // We'll compute from the data we have: sales are non-voided, we need voided count too
  // For now, track voided via a useMemo on a broader dataset — or add to loadData
  // Actually: the simplest approach is to count voided sales in the same period

  // Top 10 products
  const top10 = useMemo(() => {
    const map = {};
    activeSales.forEach(sale => {
      (sale.items || []).forEach(item => {
        const key = item.name || item.product_id;
        if (!map[key]) map[key] = { name: key, units: 0, rev: 0, productId: item.product_id };
        map[key].units += item.qty || 0;
        map[key].rev += (item.price_ref || 0) * (item.qty || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.rev - a.rev).slice(0, 10);
  }, [activeSales]);

  // Slow movers: products with 0 sales in last 14 days
  const slowMovers = useMemo(() => {
    const soldIds = new Set();
    const lastSaleDate = {};
    (slowMoverSales || []).forEach(s => {
      (s.items || []).forEach(item => {
        const pid = item.product_id;
        soldIds.add(pid);
        const d = s.created_at;
        if (!lastSaleDate[pid] || d > lastSaleDate[pid]) lastSaleDate[pid] = d;
      });
    });
    return products
      .filter(p => p.is_cantina && p.active !== false && !soldIds.has(p.id))
      .map(p => ({
        ...p,
        daysSinceLastSale: null, // no sale in 14 days — could be longer
      }))
      .sort((a, b) => (Number(b.stock_quantity || 0)) - (Number(a.stock_quantity || 0)));
  }, [products, slowMoverSales]);

  // P&L by product
  const productPL = {};
  sales.forEach((sale) => {
    const items = sale.items || [];
    items.forEach((item) => {
      if (!productPL[item.name]) productPL[item.name] = { units: 0, revenue: 0, cost: 0 };
      productPL[item.name].units += item.qty;
      productPL[item.name].revenue += item.price_ref * item.qty;
      productPL[item.name].cost += (item.cost_ref || 0) * item.qty;
    });
  });
  const plRows = Object.entries(productPL)
    .map(([name, d]) => ({ name, ...d, margin: d.revenue - d.cost, pct: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);

  // Sales by payment method (sprint 7B: read from cantina_sale_payments)
  const methodTotals = {};
  // Credits aggregated separately (no payment_method -> not in sale_payments)
  const creditAgg = sales.filter((s) => s.payment_status === "credit").reduce((s, v) => s + Number(v.total_ref || 0), 0);
  if (creditAgg > 0) methodTotals.credit = creditAgg;
  for (const p of methodPayments || []) {
    const m = p.payment_method || "otro";
    methodTotals[m] = (methodTotals[m] || 0) + Number(p.amount_ref || 0);
  }

  // Excel export
  const exportExcel = async () => {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Ventas
      const ventasData = sales.map((s) => ({
        Fecha: s.sale_date,
        Productos: (s.items || []).map((i) => `${i.qty}x ${i.name}`).join(", "),
        "Total REF": Number(s.total_ref || 0).toFixed(2),
        "Total Bs": s.total_bs ? Number(s.total_bs).toFixed(2) : "",
        Metodo: s.payment_status === "credit" ? "Credito" : (METHOD_LABELS[s.payment_method] || s.payment_method || ""),
        Cliente: s.client_name || "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventasData), "Ventas");

      // Sheet 2: Gastos
      const gastosData = expenses.map((e) => ({
        Fecha: e.expense_date,
        Categoría: e.category,
        Descripción: e.description,
        "Monto REF": Number(e.amount_ref || 0).toFixed(2),
        "Monto Bs": e.amount_bs ? Number(e.amount_bs).toFixed(2) : "",
        "Monto USD": e.amount_usd ? Number(e.amount_usd).toFixed(2) : "",
        Metodo: METHOD_LABELS[e.payment_method] || e.payment_method || "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gastosData), "Gastos");

      // Sheet 3: Creditos
      const creditosData = credits.map((c) => ({
        Cliente: c.client_name,
        "Monto original REF": Number(c.original_amount_ref || 0).toFixed(2),
        "Pagado REF": Number(c.paid_amount_ref || 0).toFixed(2),
        "Pendiente REF": (Number(c.original_amount_ref || 0) - Number(c.paid_amount_ref || 0)).toFixed(2),
        Status: c.status,
        Fecha: c.created_at?.split("T")[0] || "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(creditosData), "Creditos");

      // Sheet 4: Inventario
      const invData = products.map((p) => ({
        Producto: p.name,
        Categoría: p.category || "",
        "Stock actual": Number(p.stock_quantity || 0),
        "Costo REF": Number(p.cost_ref || 0).toFixed(2),
        "Valor REF": (Number(p.stock_quantity || 0) * Number(p.cost_ref || 0)).toFixed(2),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invData), "Inventario");

      XLSX.writeFile(wb, `Cantina_Reporte_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (err) {
      alert("Error exportando: " + err.message);
    }
    setExporting(false);
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-brand text-lg flex items-center gap-2">
          <BarChart3 size={20} /> Reportes
        </h1>
        <button onClick={exportExcel} disabled={exporting || loading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Exportar Excel
        </button>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              period === p.id ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}>{p.label}</button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="border border-stone-300 rounded-lg px-2 py-1 text-xs" />
            <span className="text-xs text-stone-400">—</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="border border-stone-300 rounded-lg px-2 py-1 text-xs" />
          </div>
        )}
      </div>

      {/* Charts (sprint 12) */}
      {chartsLoading ? (
        <p className="text-xs text-stone-400 animate-pulse py-3 text-center">Cargando graficos...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SalesLineChart data={salesByDay} />
          <TopProductsBarChart data={topProducts} />
          <HoursHeatmap data={salesHeatmap} />
          <TopClientsList data={topClients} onClientClick={(id) => setProfileClientId(id)} />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando reportes...</p>
      ) : sales.length === 0 && expenses.length === 0 && credits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-stone-500 text-sm font-medium">No hay datos para este periodo</p>
          <p className="text-stone-400 text-xs mt-1">Registra tu primera venta para ver reportes aqui</p>
        </div>
      ) : (
        <>
          {/* KPI Cards — Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Ventas" value={formatREF(totalSalesRef)} sub={rate?.eur ? formatBs(totalSalesRef, rate.eur) : null}
              change={salesChangePct} hasPrev={hasPrevData} partial={isPartialData} count={`${activeSales.length} ventas`} color="text-brand" />
            <KpiCard label="Transacciones" value={activeSales.length} change={countChangePct} hasPrev={hasPrevData} partial={isPartialData} />
            <KpiCard label="Ticket promedio" value={formatREF(ticketPromedio)} sub={rate?.eur ? formatBs(ticketPromedio, rate.eur) : null}
              change={ticketChangePct} hasPrev={hasPrevData} partial={isPartialData} />
            <KpiCard label="Items por venta" value={itemsPorVenta.toFixed(1)} sub="promedio por transaccion" />
          </div>
          {/* KPI Cards — Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-1">Gastos</p>
              <p className="text-xl font-bold text-red-600">{formatREF(totalExpRef)}</p>
              <p className="text-xs text-stone-400">{expenses.length} gastos</p>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-1">Utilidad</p>
              <p className={`text-xl font-bold ${utilidad >= 0 ? "text-green-600" : "text-red-600"}`}>{formatREF(utilidad)}</p>
              <p className="text-xs text-stone-400">{totalSalesRef > 0 ? `${((utilidad / totalSalesRef) * 100).toFixed(0)}% margen` : "—"}</p>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-1">Creditos</p>
              <p className="text-xl font-bold text-yellow-600">{formatREF(totalCreditsOutstanding)}</p>
              <p className="text-xs text-stone-400">{credits.length} pendientes</p>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <p className="text-xs text-stone-500 mb-1">Anulaciones</p>
              <p className="text-xl font-bold text-stone-600">{voidedCount}</p>
              <p className="text-xs text-stone-400">
                {(activeSales.length + voidedCount) > 0
                  ? `${((voidedCount / (activeSales.length + voidedCount)) * 100).toFixed(1)}% del total`
                  : "—"}
              </p>
            </div>
          </div>

          {/* P&L by product */}
          {/* ─── Top 10 Productos ─── */}
          {top10.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h2 className="font-bold text-sm text-stone-700">Top 10 productos del periodo</h2>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 text-xs">
                    <th className="text-left px-3 py-2 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium">Producto</th>
                    <th className="text-right px-3 py-2 font-medium">Unidades</th>
                    <th className="text-right px-3 py-2 font-medium">Total REF</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((p, i) => {
                    const prod = products.find(pr => pr.id === p.productId);
                    return (
                      <tr key={p.name} className="border-t border-stone-100">
                        <td className="px-3 py-2 text-stone-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-stone-800 flex items-center gap-2">
                          {prod?.photo_url ? (
                            <img src={prod.photo_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" loading="lazy" />
                          ) : (
                            <span className="text-base shrink-0">{prod?.emoji || "🍽️"}</span>
                          )}
                          {p.name}
                        </td>
                        <td className="px-3 py-2 text-right">{p.units}</td>
                        <td className="px-3 py-2 text-right font-bold text-brand">{formatREF(p.rev)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          )}

          {/* ─── P&L por producto (existente) ─── */}
          {plRows.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h2 className="font-bold text-sm text-stone-700">P&L por producto</h2>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 text-xs">
                    <th className="text-left px-3 py-2 font-medium">Producto</th>
                    <th className="text-right px-3 py-2 font-medium">Unidades</th>
                    <th className="text-right px-3 py-2 font-medium">Ingreso REF</th>
                    <th className="text-right px-3 py-2 font-medium">Costo REF</th>
                    <th className="text-right px-3 py-2 font-medium">Margen REF</th>
                    <th className="text-right px-3 py-2 font-medium">Margen %</th>
                  </tr>
                </thead>
                <tbody>
                  {plRows.map((r) => (
                    <tr key={r.name} className="border-t border-stone-100">
                      <td className="px-3 py-2 font-medium text-stone-800">{r.name}</td>
                      <td className="px-3 py-2 text-right">{r.units}</td>
                      <td className="px-3 py-2 text-right">{r.revenue.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-stone-500">{r.cost.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${r.margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {r.margin.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${r.pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {r.pct.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          {/* ─── Slow Movers (14 dias) ─── */}
          {slowMovers.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h2 className="font-bold text-sm text-stone-700">Productos sin movimiento (14 dias)</h2>
                <p className="text-[10px] text-stone-400 mt-0.5">{slowMovers.length} productos sin ventas en los ultimos 14 dias</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                  <thead className="sticky top-0 bg-stone-50">
                    <tr className="text-stone-500 text-xs">
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-right px-3 py-2 font-medium">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slowMovers.slice(0, 20).map(p => (
                      <tr key={p.id} className="border-t border-stone-100">
                        <td className="px-3 py-2 font-medium text-stone-800 flex items-center gap-2">
                          {p.photo_url ? (
                            <img src={p.photo_url} alt="" className="w-5 h-5 rounded object-cover shrink-0" loading="lazy" />
                          ) : (
                            <span className="text-sm shrink-0">{p.emoji || "🍽️"}</span>
                          )}
                          {p.name}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {Number(p.stock_quantity || 0) <= 0 ? (
                            <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">Sin stock</span>
                          ) : (
                            <span className="text-stone-600">{p.stock_quantity}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </div>
          )}

          {/* ─── Ventas por metodo de pago (barras) ─── */}
          {Object.keys(methodTotals).length > 0 && (() => {
            const maxMethod = Math.max(...Object.values(methodTotals));
            const entries = Object.entries(methodTotals).sort((a, b) => b[1] - a[1]);
            return (
              <div className="bg-white rounded-xl border border-stone-200 p-4">
                <h2 className="font-bold text-sm text-stone-700 mb-3">Ventas por metodo de pago</h2>
                <div className="space-y-3">
                  {entries.map(([m, total]) => {
                    const pct = totalSalesRef > 0 ? (total / totalSalesRef * 100) : 0;
                    const barW = maxMethod > 0 ? (total / maxMethod * 100) : 0;
                    return (
                      <div key={m}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-stone-600">{METHOD_LABELS[m] || m}</span>
                          <span className="text-stone-500">{formatREF(total)} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${barW}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Pending credits */}
          {credits.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <h2 className="font-bold text-sm text-stone-700">Creditos pendientes</h2>
                <button onClick={() => setShowCreditsModal(true)}
                  className="text-xs text-brand hover:underline">Ver todos</button>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 text-xs">
                    <th className="text-left px-3 py-2 font-medium">Cliente</th>
                    <th className="text-right px-3 py-2 font-medium">Original</th>
                    <th className="text-right px-3 py-2 font-medium">Pagado</th>
                    <th className="text-right px-3 py-2 font-medium">Pendiente</th>
                    <th className="text-left px-3 py-2 font-medium">Antigüedad</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.slice(0, 10).map((c) => {
                    const outstanding = Number(c.original_amount_ref) - Number(c.paid_amount_ref || 0);
                    const days = Math.floor((new Date() - new Date(c.created_at)) / 86400000);
                    return (
                      <tr key={c.id} className="border-t border-stone-100">
                        <td className="px-3 py-2 font-medium">{c.client_name}</td>
                        <td className="px-3 py-2 text-right">REF {Number(c.original_amount_ref).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-stone-500">REF {Number(c.paid_amount_ref || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-bold text-brand">REF {outstanding.toFixed(2)}</td>
                        <td className={`px-3 py-2 ${days > 7 ? "text-red-600" : days > 3 ? "text-yellow-600" : "text-green-600"}`}>
                          {days === 0 ? "Hoy" : `${days}d`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          )}

          {/* Sales history */}
          {sales.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h2 className="font-bold text-sm text-stone-700">Historial de ventas</h2>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 text-xs">
                    <th className="text-left px-3 py-2 font-medium">Hora</th>
                    <th className="text-left px-3 py-2 font-medium">Productos</th>
                    <th className="text-right px-3 py-2 font-medium">Total REF</th>
                    <th className="text-left px-3 py-2 font-medium">Metodo</th>
                    <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                      <td className="px-3 py-2 text-stone-500 text-xs">
                        {new Date(s.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2 text-stone-600 text-xs">
                        {(s.items || []).map((i) => `${i.qty}x ${i.name}`).join(", ")}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">REF {Number(s.total_ref).toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs">
                        {s.payment_status === "credit" ? (
                          <span className="text-yellow-600 font-medium">Credito</span>
                        ) : (
                          METHOD_LABELS[s.payment_method] || s.payment_method
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-400">{s.client_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          {/* ─── Heat Map: Ventas ultimos 30 dias ─── */}
          <HeatMap sales={heatSales} loading={heatLoading} rate={rate} />
        </>
      )}

      {showCreditsModal && (
        <CreditsModal user={user} rate={rate} onClose={() => setShowCreditsModal(false)} onUpdated={loadData} />
      )}

      {profileClientId && (
        <ClientProfileModal
          clientId={profileClientId}
          user={user}
          onClose={() => setProfileClientId(null)}
        />
      )}
    </div>
  );
}
