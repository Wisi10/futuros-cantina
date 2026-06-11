"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Maximize2, Minimize2, RefreshCw, Download } from "lucide-react";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs, METHOD_LABELS, ProductImage } from "@/lib/utils";

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function DashboardView({ user, rate, products, embedded = false, compact = false }) {
  const productsById = useMemo(() => {
    const map = {};
    for (const p of products || []) map[p.id] = p;
    return map;
  }, [products]);

  const [sales, setSales] = useState([]);
  const [salePayments, setSalePayments] = useState([]);
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
      // maybeSingle() — si no hay turno abierto, devuelve null sin tirar error.
      supabase.from("shifts").select("*").eq("status", "open").limit(1).maybeSingle(),
    ]);
    const list = salesRes.data || [];
    setSales(list);
    setShift(shiftRes.data || null);
    setLastRefresh(new Date());
    const ids = list.map((s) => s.id);
    if (ids.length > 0) {
      const { data: sp } = await supabase
        .from("cantina_sale_payments")
        .select("sale_id, payment_method, amount_ref, is_change")
        .in("sale_id", ids);
      setSalePayments(sp || []);
    } else {
      setSalePayments([]);
    }
  }, [today]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  // Totals
  const totalRef = sales.reduce((s, v) => s + parseFloat(v.total_ref || 0), 0);
  const totalBs = rate?.usd ? totalRef * rate.usd : 0;
  const salesCount = sales.length;

  // By method (sprint 7B: lee de cantina_sale_payments + agrega creditos)
  const byMethod = {};
  for (const p of salePayments) {
    const m = p.payment_method || "otro";
    byMethod[m] = (byMethod[m] || 0) + parseFloat(p.amount_ref || 0);
  }
  const credTotal = sales.filter((s) => s.payment_status === "credit").reduce((s, v) => s + parseFloat(v.total_ref || 0), 0);
  if (credTotal > 0) byMethod.credit = (byMethod.credit || 0) + credTotal;

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
    <div className={
      compact ? "px-3 py-1.5 bg-brand-cream-light"
      : embedded ? "px-3 py-2 bg-brand-cream-light"
      : "flex-1 overflow-y-auto p-4 md:p-6 bg-brand-cream-light"
    }>
      {/* Header (excluded from export) */}
      <div className={`flex items-center justify-between ${compact ? "mb-1.5" : embedded ? "mb-2" : "mb-6"}`}>
        <div>
          <h2 className={`font-bold text-stone-800 ${compact ? "text-xs" : embedded ? "text-sm" : "text-lg"}`}>Dashboard en Vivo</h2>
          {!embedded && <p className="text-[10px] text-stone-400 uppercase tracking-[1.5px]" style={mono}>
            {today} — auto-refresh cada 30s
            {lastRefresh && ` — ultimo: ${fmtTime(lastRefresh)}`}
          </p>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleExport} disabled={exporting} className={`rounded-lg hover:bg-stone-200 text-stone-500 transition-colors flex items-center gap-1 font-medium disabled:opacity-50 ${embedded ? "px-1.5 py-1 text-[11px]" : "px-2.5 py-2 text-xs"}`} title="Exportar como imagen">
            <Download size={embedded ? 12 : 14} /> {!embedded && (exporting ? "Exportando..." : "Exportar")}
          </button>
          <button onClick={loadData} className={`rounded-lg hover:bg-stone-200 text-stone-400 transition-colors ${embedded ? "p-1" : "p-2"}`} title="Refrescar ahora">
            <RefreshCw size={embedded ? 12 : 16} />
          </button>
          <button onClick={toggleFullscreen} className={`rounded-lg hover:bg-stone-200 text-stone-400 transition-colors ${embedded ? "p-1" : "p-2"}`} title="Pantalla completa">
            {fullscreen ? <Minimize2 size={embedded ? 12 : 16} /> : <Maximize2 size={embedded ? 12 : 16} />}
          </button>
        </div>
      </div>

      <div id="dashboard-export-area">

      {/* KPIs */}
      <div className={`grid grid-cols-4 ${compact ? "gap-1.5 mb-1.5" : embedded ? "gap-2 mb-2" : "gap-4 mb-6"}`}>
        <div className={`bg-white border ${compact ? "rounded-lg p-1.5" : embedded ? "rounded-2xl p-2.5" : "rounded-2xl p-5"}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[9px] text-stone-400 uppercase tracking-wider font-medium">Ventas hoy</p>
          <p className={`font-normal text-stone-800 ${compact ? "text-sm" : embedded ? "text-lg" : "text-3xl"}`} style={serif}>{formatREF(totalRef)}</p>
          <p className="text-[9px] text-stone-400" style={mono}>{formatBs(totalRef, rate?.usd)}</p>
        </div>
        <div className={`bg-white border ${compact ? "rounded-lg p-1.5" : embedded ? "rounded-2xl p-2.5" : "rounded-2xl p-5"}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[9px] text-stone-400 uppercase tracking-wider font-medium">Transacciones</p>
          <p className={`font-normal text-stone-800 ${compact ? "text-sm" : embedded ? "text-lg" : "text-3xl"}`} style={serif}>{salesCount}</p>
          <p className="text-[9px] text-stone-400" style={mono}>
            {salesCount > 0 ? `Prom: ${formatREF(totalRef / salesCount)}` : "Sin ventas"}
          </p>
        </div>
        <div className={`bg-white border ${compact ? "rounded-lg p-1.5" : embedded ? "rounded-2xl p-2.5" : "rounded-2xl p-5"}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[9px] text-stone-400 uppercase tracking-wider font-medium">Turno</p>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${shift ? "bg-ok" : "bg-stone-300"}`}
              style={shift ? { animation: "pulse-dot 2s ease-in-out infinite" } : {}} />
            <p className={`text-stone-800 ${compact ? "text-xs" : embedded ? "text-sm" : "text-lg"}`} style={serif}>
              {shift ? "Abierto" : "Cerrado"}
            </p>
          </div>
          {shift && <p className="text-[9px] text-stone-400" style={mono}>desde {fmtTime(shift.opened_at)}</p>}
        </div>
        <div className={`bg-white border ${compact ? "rounded-lg p-1.5" : embedded ? "rounded-2xl p-2.5" : "rounded-2xl p-5"}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className="text-[9px] text-stone-400 uppercase tracking-wider font-medium">Tasa</p>
          <p className={`font-normal text-stone-800 ${compact ? "text-xs" : embedded ? "text-base" : "text-2xl"}`} style={serif}>
            {rate?.usd ? `Bs ${rate.usd.toFixed(2)}` : "—"}
          </p>
          <p className="text-[9px] text-stone-400" style={mono}>
            {rate?.eur ? `REF ${rate.eur.toFixed(2)}` : ""}
          </p>
        </div>
      </div>

      <div className={`grid grid-cols-3 ${compact ? "gap-1.5" : embedded ? "gap-2" : "gap-4"}`}>
        {/* Recent sales — compact muestra 3, sino 5 */}
        <div className={`col-span-2 bg-white border ${compact ? "rounded-lg p-2" : embedded ? "rounded-2xl p-2.5" : "rounded-2xl p-5"}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <p className={`text-[9px] text-stone-400 uppercase tracking-wider font-medium ${compact ? "mb-1" : "mb-3"}`}>Ultimas ventas</p>
          {recentSales.length === 0 ? (
            <p className={`text-xs text-stone-300 text-center ${compact ? "py-2" : "py-8"}`}>Sin ventas hoy</p>
          ) : (
            <div className={compact ? "space-y-0.5" : "space-y-2"}>
              {recentSales.slice(0, compact ? 3 : recentSales.length).map((sale, i) => {
                const items = sale.items || [];
                const itemSummary = items.map(it => `${it.qty}x ${it.name}`).join(", ");
                const method = METHOD_LABELS[sale.payment_method] || (sale.payment_status === "credit" ? "Credito" : "—");
                return (
                  <div key={sale.id || i} className={`flex items-center justify-between ${compact ? "py-0.5" : "py-2 border-b border-stone-100 last:border-0"}`}>
                    <div className="min-w-0 flex-1">
                      <p className={`text-stone-700 truncate ${compact ? "text-[11px]" : "text-sm"}`}>{itemSummary || "Venta"}</p>
                      {!compact && (
                        <p className="text-[10px] text-stone-400" style={mono}>
                          {fmtTime(sale.created_at)} — {method}
                          {sale.client_name ? ` — ${sale.client_name}` : ""}
                        </p>
                      )}
                    </div>
                    <p className={`font-medium text-stone-800 ml-2 shrink-0 ${compact ? "text-[11px]" : "text-sm"}`} style={serif}>{formatREF(sale.total_ref)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className={compact ? "space-y-1.5" : embedded ? "space-y-2" : "space-y-4"}>
          {/* By payment method */}
          <div className={`bg-white border ${compact ? "rounded-lg p-2" : embedded ? "rounded-2xl p-2.5" : "rounded-2xl p-5"}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <p className={`text-[9px] text-stone-400 uppercase tracking-wider font-medium ${compact ? "mb-1" : "mb-3"}`}>Por metodo de pago</p>
            {Object.keys(byMethod).length === 0 ? (
              <p className="text-xs text-stone-300">—</p>
            ) : (
              <div className={compact ? "space-y-1" : "space-y-2"}>
                {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).slice(0, compact ? 3 : undefined).map(([method, total]) => {
                  const pct = totalRef > 0 ? (total / totalRef * 100) : 0;
                  return (
                    <div key={method}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className="text-stone-600 truncate">{METHOD_LABELS[method] || method}</span>
                        <span style={mono}>{formatREF(total)}</span>
                      </div>
                      <div className={`bg-stone-100 rounded-full overflow-hidden ${compact ? "h-1" : "h-1.5"}`}>
                        <div className="h-full bg-gold rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top products — compact 3, sino 5 */}
          <div className={`bg-white border ${compact ? "rounded-lg p-2" : embedded ? "rounded-2xl p-2.5" : "rounded-2xl p-5"}`} style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <p className={`text-[9px] text-stone-400 uppercase tracking-wider font-medium ${compact ? "mb-1" : "mb-3"}`}>Mas vendidos hoy</p>
            {topProducts.length === 0 ? (
              <p className="text-xs text-stone-300">—</p>
            ) : (
              <div className={compact ? "space-y-1" : "space-y-2"}>
                {topProducts.slice(0, compact ? 3 : topProducts.length).map((p, i) => {
                  const productData = p.id ? productsById[p.id] : null;
                  return (
                    <div key={p.id || p.name} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-500 shrink-0 ${compact ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]"}`}>{i + 1}</span>
                        {!compact && <ProductImage product={productData || { name: p.name }} size={24} className="rounded" />}
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
