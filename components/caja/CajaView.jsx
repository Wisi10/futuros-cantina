"use client";
import { useState, useEffect, useCallback } from "react";
import { DollarSign, Hash, CreditCard, Banknote, ChevronDown, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBs, METHOD_LABELS } from "@/lib/utils";
import * as XLSX from "xlsx";

const METHOD_ICONS = {
  pago_movil: "📱",
  cash_bs: "💵",
  cash_usd: "💲",
  zelle: "🏦",
  credit: "📋",
};

export default function CajaView({ user, rate }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSale, setExpandedSale] = useState(null);

  const isToday = selectedDate === new Date().toISOString().split("T")[0];
  const isAdmin = user?.role === "admin";

  const loadSales = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("cantina_sales")
      .select("*")
      .eq("sale_date", selectedDate)
      .is("voided_at", null)
      .order("created_at", { ascending: false });
    setSales(data || []);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  // KPI calculations
  const totalRef = sales.reduce((sum, s) => sum + parseFloat(s.total_ref || 0), 0);
  const totalCount = sales.length;
  const creditSales = sales.filter((s) => s.payment_status === "credit");
  const creditTotal = creditSales.reduce((sum, s) => sum + parseFloat(s.total_ref || 0), 0);
  const paidTotal = totalRef - creditTotal;

  // Payment method breakdown
  const methodBreakdown = {};
  sales.forEach((s) => {
    const method = s.payment_status === "credit" ? "credit" : (s.payment_method || "otro");
    if (!methodBreakdown[method]) methodBreakdown[method] = { count: 0, total: 0 };
    methodBreakdown[method].count++;
    methodBreakdown[method].total += parseFloat(s.total_ref || 0);
  });

  const exportExcel = () => {
    const rows = sales.map((s) => ({
      Hora: new Date(s.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
      Items: (s.items || []).map((i) => `${i.name} x${i.qty}`).join(", "),
      "Total REF": parseFloat(s.total_ref || 0).toFixed(2),
      "Total Bs": s.total_bs ? parseFloat(s.total_bs).toFixed(2) : "—",
      Metodo: s.payment_status === "credit" ? "Credito" : (METHOD_LABELS[s.payment_method] || s.payment_method || "—"),
      Estado: s.payment_status === "credit" ? "Credito" : "Pagado",
      Cliente: s.client_name || "—",
      Operador: s.created_by || "—",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, `caja-${selectedDate}.xlsx`);
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-800">
          {isToday ? "Caja del dia" : `Caja — ${selectedDate}`}
        </h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs border border-stone-200 rounded-lg px-2 py-1.5 text-stone-600"
              />
              <button
                onClick={exportExcel}
                disabled={sales.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-30 transition-colors"
              >
                <Download size={14} /> Exportar
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm animate-pulse">Cargando...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard
              icon={<DollarSign size={20} />}
              label="Total ventas"
              value={`REF ${totalRef.toFixed(2)}`}
              sub={rate ? formatBs(totalRef, rate.eur) : null}
              color="text-brand"
            />
            <KPICard
              icon={<Hash size={20} />}
              label="# de ventas"
              value={totalCount}
              sub="ventas"
              color="text-stone-700"
            />
            <KPICard
              icon={<CreditCard size={20} />}
              label="Creditos"
              value={`REF ${creditTotal.toFixed(2)}`}
              sub="pendientes"
              color="text-amber-600"
            />
            <KPICard
              icon={<Banknote size={20} />}
              label="Efectivo"
              value={`REF ${paidTotal.toFixed(2)}`}
              sub="cobrado"
              color="text-green-600"
            />
          </div>

          {/* Payment method breakdown */}
          {Object.keys(methodBreakdown).length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h3 className="text-sm font-bold text-stone-700">Desglose por metodo de pago</h3>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="text-xs text-stone-400 border-b border-stone-100">
                    <th className="text-left px-4 py-2 font-medium">Metodo</th>
                    <th className="text-center px-4 py-2 font-medium"># ventas</th>
                    <th className="text-right px-4 py-2 font-medium">Total REF</th>
                    <th className="text-right px-4 py-2 font-medium">Total Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(methodBreakdown)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([method, data]) => (
                      <tr key={method} className="border-b border-stone-50 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-stone-700">
                          {METHOD_ICONS[method] || "💳"} {METHOD_LABELS[method] || method}
                        </td>
                        <td className="px-4 py-2.5 text-center text-stone-500">{data.count}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-brand">
                          REF {data.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-stone-400 text-xs">
                          {method === "credit" ? "—" : rate ? formatBs(data.total, rate.eur) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Recent sales */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-700">
                {isToday ? "Ventas de hoy" : "Ventas del dia"} ({sales.length})
              </h3>
            </div>

            {sales.length === 0 ? (
              <div className="text-center py-8 text-stone-400 text-xs">
                No hay ventas registradas
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {sales.map((sale) => {
                  const items = sale.items || [];
                  const time = new Date(sale.created_at).toLocaleTimeString("es-VE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const isCredit = sale.payment_status === "credit";
                  const method = isCredit ? "Credito" : (METHOD_LABELS[sale.payment_method] || sale.payment_method || "—");
                  const icon = isCredit ? "📋" : (METHOD_ICONS[sale.payment_method] || "💳");
                  const expanded = expandedSale === sale.id;

                  return (
                    <div key={sale.id}>
                      <button
                        onClick={() => setExpandedSale(expanded ? null : sale.id)}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-stone-50 transition-colors"
                      >
                        <span className="text-xs text-stone-400 w-12 shrink-0">{time}</span>
                        <span className="text-xs text-stone-600 flex-1 truncate">
                          {items.map((i) => `${i.name} x${i.qty}`).join(", ")}
                        </span>
                        <span className="text-xs font-bold text-brand whitespace-nowrap">
                          REF {parseFloat(sale.total_ref).toFixed(2)}
                        </span>
                        <span className="text-xs text-stone-400 w-20 text-right truncate">
                          {icon} {method}
                        </span>
                        <ChevronDown
                          size={14}
                          className={`text-stone-300 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
                        />
                      </button>

                      {expanded && (
                        <div className="px-4 pb-3 pt-1 bg-stone-50 text-xs space-y-1">
                          {items.map((item, i) => (
                            <div key={i} className="flex justify-between text-stone-500">
                              <span>{item.name} x{item.qty}</span>
                              <span>REF {(item.price_ref * item.qty).toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-1 border-t border-stone-200 font-semibold text-stone-700">
                            <span>Total</span>
                            <span>REF {parseFloat(sale.total_ref).toFixed(2)}</span>
                          </div>
                          {sale.client_name && (
                            <div className="text-stone-400">Cliente: {sale.client_name}</div>
                          )}
                          {sale.created_by && (
                            <div className="text-stone-400">Operador: {sale.created_by}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KPICard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-stone-400">{icon}</div>
        <span className="text-xs text-stone-400 font-medium">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-stone-400 mt-0.5">{sub}</p>}
    </div>
  );
}
