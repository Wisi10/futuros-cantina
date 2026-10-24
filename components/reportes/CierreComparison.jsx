"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatREF } from "@/lib/utils";
import { fetchAll } from "@/lib/fetchAll";

// Cierre reportado por el gerente (impresion del POS enviada por WhatsApp)
// vs ventas registradas en el sistema. El sistema es la verdad de productos;
// aqui solo se muestra la diferencia en REF, sin inferir que se vendio.
const TOLERANCE = 0.05;

export default function CierreComparison({ from, to }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      setLoading(true);
      try {
        const [closingsRes, salesRes] = await Promise.all([
          supabase.from("cantina_daily_closings").select("closing_date, total")
            .gte("closing_date", from).lte("closing_date", to),
          fetchAll(() => supabase.from("cantina_sales").select("sale_date, total_ref")
            .gte("sale_date", from).lte("sale_date", to).is("voided_at", null).order("id")),
        ]);
        const byDay = {};
        (closingsRes.data || []).forEach((c) => {
          byDay[c.closing_date] = { date: c.closing_date, reported: Number(c.total), system: 0 };
        });
        (salesRes.data || []).forEach((s) => {
          const d = byDay[s.sale_date] || (byDay[s.sale_date] = { date: s.sale_date, reported: null, system: 0 });
          d.system += Number(s.total_ref || 0);
        });
        if (!cancelled) setRows(Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date)));
      } catch (err) {
        console.error("[CIERRES] load error:", err);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  const withReport = rows.filter((r) => r.reported != null);
  if (!loading && withReport.length === 0) return null;

  const reported = withReport.reduce((s, r) => s + r.reported, 0);
  const system = withReport.reduce((s, r) => s + r.system, 0);
  const diff = reported - system;
  const pct = reported > 0 ? system / reported : 0;

  const diffClass = (r) => {
    if (r.reported == null) return "text-stone-300";
    const d = r.reported - r.system;
    if (Math.abs(d) <= r.reported * TOLERANCE) return "text-stone-500";
    return d > 0 ? "text-amber-600 font-bold" : "text-red-600 font-bold";
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-stone-800">Cierre reportado vs sistema</h3>
          <p className="text-[11px] text-stone-500">Cierre del gerente (POS) comparado con las ventas registradas. Solo días con cierre.</p>
        </div>
        {withReport.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} className="text-[11px] text-brand hover:underline shrink-0">
            {open ? "Ocultar días" : "Ver por día"}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-stone-400 animate-pulse">Cargando cierres...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-stone-50 rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Cierre reportado</p>
              <p className="text-lg font-bold text-stone-800">{formatREF(reported)}</p>
            </div>
            <div className="bg-stone-50 rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Registrado en sistema</p>
              <p className="text-lg font-bold text-stone-800">{formatREF(system)}</p>
            </div>
            <div className="bg-stone-50 rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-wider text-stone-500">Diferencia</p>
              <p className={`text-lg font-bold ${diff > reported * TOLERANCE ? "text-amber-600" : diff < -reported * TOLERANCE ? "text-red-600" : "text-stone-800"}`}>
                {formatREF(diff)}
              </p>
            </div>
            <div className="bg-stone-50 rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-wider text-stone-500">% registrado</p>
              <p className="text-lg font-bold text-stone-800">{Math.round(pct * 100)}%</p>
            </div>
          </div>

          {open && (
            <div className="mt-3 max-h-80 overflow-auto border border-stone-100 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 text-xs uppercase">
                    <th className="text-left px-3 py-2 font-medium">Día</th>
                    <th className="text-right px-3 py-2 font-medium">Cierre</th>
                    <th className="text-right px-3 py-2 font-medium">Sistema</th>
                    <th className="text-right px-3 py-2 font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date} className="border-t border-stone-100">
                      <td className="px-3 py-1.5 text-stone-700">{r.date.split("-").reverse().join("/")}</td>
                      <td className="px-3 py-1.5 text-right">{r.reported == null ? <span className="text-stone-300">sin cierre</span> : formatREF(r.reported)}</td>
                      <td className="px-3 py-1.5 text-right">{formatREF(r.system)}</td>
                      <td className={`px-3 py-1.5 text-right ${diffClass(r)}`}>
                        {r.reported == null ? "—" : formatREF(r.reported - r.system)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
