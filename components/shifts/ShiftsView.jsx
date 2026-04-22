"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatREF, METHOD_LABELS } from "@/lib/utils";

export default function ShiftsView({ user }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [expandedSales, setExpandedSales] = useState([]);

  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    const { data } = await supabase
      .from("shifts")
      .select("*")
      .order("opened_at", { ascending: false })
      .limit(50);
    setShifts(data || []);
    setLoading(false);
  };

  const toggleExpand = async (shiftId) => {
    if (expanded === shiftId) { setExpanded(null); return; }
    setExpanded(shiftId);
    const { data } = await supabase
      .from("cantina_sales")
      .select("total_ref, payment_method, payment_status, items, created_at")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    setExpandedSales(data || []);
  };

  const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString("es-VE", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit" }) : "—";
  const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const mono = { fontFamily: "'Courier New', monospace", fontSize: 12 };
  const diffColor = (d) => !d && d !== 0 ? "text-stone-400" : d === 0 ? "text-ok" : d < 0 ? "text-danger" : "text-warn";

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-stone-400 animate-pulse">Cargando turnos...</p></div>;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="text-sm font-bold text-stone-700 mb-3">Historial de Turnos</h2>

      {shifts.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-8">Sin turnos registrados</p>
      ) : (
        <div className="space-y-2">
          {shifts.map(s => {
            const isExpanded = expanded === s.id;
            const salesTotal = isExpanded ? expandedSales.reduce((sum, v) => sum + parseFloat(v.total_ref || 0), 0) : null;
            return (
              <div key={s.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <button onClick={() => toggleExpand(s.id)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-3 text-left">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${s.status === "open" ? "bg-ok" : "bg-stone-300"}`} />
                    <div>
                      <p className="text-sm text-stone-700 font-medium">{fmtDate(s.opened_at)}</p>
                      <p className="text-[10px] text-stone-400" style={mono}>{fmtTime(s.opened_at)} - {s.status === "open" ? "abierto" : fmtTime(s.closed_at)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-stone-400">{s.opened_by}{s.closed_by && s.closed_by !== s.opened_by ? ` / ${s.closed_by}` : ""}</p>
                    {s.difference_bs != null && (
                      <p className={`text-[10px] font-medium ${diffColor(s.difference_bs)}`} style={mono}>
                        {s.difference_bs >= 0 ? "+" : ""}{parseFloat(s.difference_bs).toLocaleString("es-VE", { minimumFractionDigits: 0 })} Bs
                      </p>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-stone-100 px-4 py-3 bg-stone-50 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 mb-1">Efectivo inicial</p>
                        <p style={mono}>Bs {parseFloat(s.opening_cash_bs || 0).toLocaleString("es-VE")} / ${parseFloat(s.opening_cash_usd || 0).toFixed(2)}</p>
                      </div>
                      {s.status === "closed" && (
                        <>
                          <div>
                            <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 mb-1">Esperado</p>
                            <p style={mono}>Bs {parseFloat(s.closing_cash_bs_expected || 0).toLocaleString("es-VE")} / ${parseFloat(s.closing_cash_usd_expected || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 mb-1">Contado</p>
                            <p style={mono}>Bs {parseFloat(s.closing_cash_bs_actual || 0).toLocaleString("es-VE")} / ${parseFloat(s.closing_cash_usd_actual || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 mb-1">Diferencia</p>
                            <p className={`font-medium ${diffColor(s.difference_bs)}`} style={mono}>
                              Bs {s.difference_bs != null ? (s.difference_bs >= 0 ? "+" : "") + parseFloat(s.difference_bs).toLocaleString("es-VE") : "—"}
                              {" / "}
                              ${s.difference_usd != null ? (s.difference_usd >= 0 ? "+" : "") + parseFloat(s.difference_usd).toFixed(2) : "—"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {salesTotal != null && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 mb-1">Ventas del turno ({expandedSales.length})</p>
                        <p className="text-sm font-medium" style={{ fontFamily: "Georgia, serif" }}>{formatREF(salesTotal)}</p>
                        <div className="mt-2 space-y-1">
                          {expandedSales.slice(0, 15).map((sale, i) => (
                            <div key={i} className="flex justify-between text-[11px] text-stone-500">
                              <span style={mono}>{fmtTime(sale.created_at)} · {METHOD_LABELS[sale.payment_method] || sale.payment_status || "—"}</span>
                              <span style={mono}>{formatREF(sale.total_ref)}</span>
                            </div>
                          ))}
                          {expandedSales.length > 15 && <p className="text-[10px] text-stone-400">...y {expandedSales.length - 15} mas</p>}
                        </div>
                      </div>
                    )}

                    {s.notes && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 mb-1">Notas</p>
                        <p className="text-xs text-stone-600">{s.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
