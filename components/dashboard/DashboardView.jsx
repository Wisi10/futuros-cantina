"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Maximize2, Minimize2, RefreshCw, Download } from "lucide-react";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs, METHOD_LABELS, ProductImage } from "@/lib/utils";

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function DashboardView({ user, rate, products }) {
  const productsById = useMemo(() => {
    const map = {};
    for (const p of products || []) map[p.id] = p;
    return map;
  }, [products]);

  const [sales, setSales] = useState([]);
  const [shift, setShift] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  const loadData = useCallback(async () => {
    if (!supabase) return;
    const [salesRes, shiftRes] = await Promise.all([
      supabase.from("cantina_sales").select("*").eq("sale_date", today).is("voided_at", null).order("created_at", { ascending: false }),
      supabase.from("shifts").select("*").eq("status", "open").limit(1).single(),
    ]);
    setSales(salesRes.data || []);
    setShift(shiftRes.data || null);
    setLastRefresh(new Date());
  }, [today]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // Totals
  const totalRef = sales.reduce((s, v) => s + parseFloat(v.total_ref || 0), 0);
  const totalBs = rate?.eur ? totalRef * rate.eur : 0;
  const salesCount = sales.length;

  // By method
  const byMethod = {};
  sales.forEach(s => {
    const m = s.payment_method || (s.payment_status === "credit" ? "credit" : "otro");
    byMethod[m] = (byMethod[m] || 0) + parseFloat(s.total_ref || 0);
  });

  // Top products — key by product_id when available, fallback to name
  const aggMap = {};
  sales.forEach(s => {
    (s.items || []).forEach(item => {
      const key = item.product_id || item.name;
      if (!aggMap[key]) aggMap[key] = { id: item.product_id || null, name: item.name || "?", qty: 0, rev: 0 };
      aggMap[key].qty += item.qty || 0;
      aggMap[key].rev += (item.price_ref || 0) * (item.qty || 0);
    });
  });
  const topProducts = Object.values(aggMap).sort((a, b) => b.qty - a.qty).slice(0, 6);

  // Last 5 sales
  const recentSales = sales.slice(0, 5);

  const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString("es-VE", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit" }) : "";

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const el = document.getElementById("dashboard-export-area");
      if (!el) return;
      const canvas = await html2canvas(el, {
        backgroundColor: "#f5f1eb",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
      link.download = `en-vivo-${ymd}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("[DashboardView] export error:", e);
      alert("No se pudo exportar la imagen.");
    } finally {
      setExporting(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const mono = { fontFamily: "'Courier New', monospace" };
  const serif = { fontFamily: "Georgia, serif", letterSpacing: "-0.3px" };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-brand-cream-light">
      {/* Header (excluded from export) */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-stone-800">Dashboard en Vivo</h2>
          <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px]" style={mono}>
            {today} — auto-refresh cada 30s
            {lastRefresh && ` — ultimo: ${fmtTime(lastRefresh)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className="px-2.5 py-2 rounded-lg hover:bg-stone-200 text-stone-500 transition-colors flex items-center gap-1 text-xs font-medium disabled:opacity-50" title="Exportar como imagen">
            <Download size={14} /> {exporting ? "Exportando..." : "Exportar"}
          </button>
          <button onClick={loadData} className="p-2 rounded-lg hover:bg-stone-200 text-stone-400 transition-colors" title="Refrescar ahora">
            <RefreshCw size={16} />
          </button>
          <button onClick={toggleFullscreen} className="p-2 rounded-lg hover:bg-stone-200 text-stone-400 transition-colors" title="Pantalla completa">
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div id="dashboard-export-area">

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px] font-medium mb-1">Ventas hoy</p>
          <p className="text-3xl font-normal text-stone-800" style={serif}>{formatREF(totalRef)}</p>
          <p className="text-xs text-stone-400 mt-1" style={mono}>{formatBs(totalRef, rate?.eur)}</p>
        </div>
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px] font-medium mb-1">Transacciones</p>
          <p className="text-3xl font-normal text-stone-800" style={serif}>{salesCount}</p>
          <p className="text-xs text-stone-400 mt-1" style={mono}>
            {salesCount > 0 ? `Promedio: ${formatREF(totalRef / salesCount)}` : "Sin ventas"}
          </p>
        </div>
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px] font-medium mb-1">Turno</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-3 h-3 rounded-full ${shift ? "bg-ok" : "bg-stone-300"}`}
              style={shift ? { animation: "pulse-dot 2s ease-in-out infinite" } : {}} />
            <p className="text-lg text-stone-800" style={serif}>
              {shift ? "Abierto" : "Cerrado"}
            </p>
          </div>
          {shift && <p className="text-xs text-stone-400 mt-1" style={mono}>desde {fmtTime(shift.opened_at)} — {shift.opened_by}</p>}
        </div>
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px] font-medium mb-1">Tasa del dia</p>
          <p className="text-2xl font-normal text-stone-800" style={serif}>
            {rate?.eur ? `Bs ${rate.eur.toFixed(2)}` : "—"}
          </p>
          <p className="text-xs text-stone-400 mt-1" style={mono}>
            {rate?.usd ? `USD ${rate.usd.toFixed(2)}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Recent sales */}
        <div className="md:col-span-2 bg-white rounded-2xl border p-5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px] font-medium mb-3">Ultimas ventas</p>
          {recentSales.length === 0 ? (
            <p className="text-sm text-stone-300 text-center py-8">Sin ventas hoy</p>
          ) : (
            <div className="space-y-2">
              {recentSales.map((sale, i) => {
                const items = sale.items || [];
                const itemSummary = items.map(it => `${it.qty}x ${it.name}`).join(", ");
                const method = METHOD_LABELS[sale.payment_method] || (sale.payment_status === "credit" ? "Credito" : "—");
                return (
                  <div key={sale.id || i} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-stone-700 truncate">{itemSummary || "Venta"}</p>
                      <p className="text-[10px] text-stone-400" style={mono}>
                        {fmtTime(sale.created_at)} — {method}
                        {sale.client_name ? ` — ${sale.client_name}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-stone-800 ml-3 shrink-0" style={serif}>{formatREF(sale.total_ref)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* By payment method */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px] font-medium mb-3">Por metodo de pago</p>
            {Object.keys(byMethod).length === 0 ? (
              <p className="text-xs text-stone-300">—</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([method, total]) => {
                  const pct = totalRef > 0 ? (total / totalRef * 100) : 0;
                  return (
                    <div key={method}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-stone-600">{METHOD_LABELS[method] || method}</span>
                        <span style={mono}>{formatREF(total)}</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gold rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top products */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px] font-medium mb-3">Mas vendidos hoy</p>
            {topProducts.length === 0 ? (
              <p className="text-xs text-stone-300">—</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p, i) => {
                  const productData = p.id ? productsById[p.id] : null;
                  return (
                    <div key={p.id || p.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-500 shrink-0">{i + 1}</span>
                        <ProductImage product={productData || { name: p.name }} size={24} className="rounded" />
                        <span className="text-stone-700 truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-stone-400" style={mono}>{p.qty}u</span>
                        <span className="font-medium" style={mono}>{formatREF(p.rev)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
