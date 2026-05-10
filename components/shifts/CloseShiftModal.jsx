"use client";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs, METHOD_LABELS } from "@/lib/utils";

export default function CloseShiftModal({ shift, rate, onClose, onClosed }) {
  const [sales, setSales] = useState([]);
  const [salePayments, setSalePayments] = useState([]);
  const [countedBs, setCountedBs] = useState("");
  const [countedUsd, setCountedUsd] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shift?.id) return;
    (async () => {
      const { data: salesData } = await supabase
        .from("cantina_sales")
        .select("id, total_ref, payment_method, payment_status, voided_at")
        .eq("shift_id", shift.id)
        .is("voided_at", null);
      const list = salesData || [];
      setSales(list);
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
    })();
  }, [shift?.id]);

  const openTime = new Date(shift.opened_at).toLocaleTimeString("es-VE", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit" });
  const totalSalesRef = sales.reduce((s, v) => s + parseFloat(v.total_ref || 0), 0);
  const salesCount = sales.length;

  // Breakdown by method (from cantina_sale_payments). Credits stay aggregated separately.
  const byMethod = {};
  for (const p of salePayments) {
    const m = p.payment_method || "otro";
    byMethod[m] = (byMethod[m] || 0) + parseFloat(p.amount_ref || 0);
  }
  // Add credits aggregate
  const creditTotal = sales.filter((s) => s.payment_status === "credit").reduce((s, v) => s + parseFloat(v.total_ref || 0), 0);
  if (creditTotal > 0) byMethod.credit = (byMethod.credit || 0) + creditTotal;

  // Expected cash drawer = opening + cash_bs + cash_usd contributions
  // amount_ref is negative for change-out rows, so SUM naturally subtracts vueltos
  const cashBsSales = (byMethod.cash_bs || 0) * (rate?.eur || 0);
  const cashUsdSales = byMethod.cash_usd || 0;
  const expectedBs = parseFloat(shift.opening_cash_bs || 0) + cashBsSales;
  const expectedUsd = parseFloat(shift.opening_cash_usd || 0) + cashUsdSales;

  const actualBs = parseFloat(countedBs) || 0;
  const actualUsd = parseFloat(countedUsd) || 0;
  const diffBs = actualBs - expectedBs;
  const diffUsd = actualUsd - expectedUsd;

  const diffColor = (d) => d === 0 ? "text-ok" : d < 0 ? "text-danger" : "text-warn";

  const handleClose = async () => {
    setSaving(true);
    setError("");
    try {
      const { error: updateErr } = await supabase
        .from("shifts")
        .update({
          closed_by: shift.opened_by,
          closed_at: new Date().toISOString(),
          closing_cash_bs_expected: expectedBs,
          closing_cash_bs_actual: actualBs || null,
          closing_cash_usd_expected: expectedUsd,
          closing_cash_usd_actual: actualUsd || null,
          difference_bs: countedBs ? diffBs : null,
          difference_usd: countedUsd ? diffUsd : null,
          notes: notes || null,
          status: "closed",
        })
        .eq("id", shift.id);

      if (updateErr) throw updateErr;
      onClosed();
    } catch (err) {
      setError("Error cerrando turno: " + err.message);
      setSaving(false);
    }
  };

  const mono = { fontFamily: "'Courier New', monospace" };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-stone-800">Cerrar Turno</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg"><X size={18} className="text-stone-400" /></button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Summary */}
          <div className="bg-stone-50 rounded-xl p-4 space-y-2">
            <p className="text-xs text-stone-500">Abierto a las <span style={mono}>{openTime}</span> por <span className="font-medium text-stone-700">{shift.opened_by}</span></p>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Ventas del turno</span>
              <span className="font-medium" style={{ fontFamily: "Georgia, serif" }}>{formatREF(totalSalesRef)}</span>
            </div>
            <p className="text-[10px] text-stone-400" style={mono}>{salesCount} venta{salesCount !== 1 ? "s" : ""}</p>

            {Object.keys(byMethod).length > 0 && (
              <div className="border-t border-stone-200 pt-2 mt-2 space-y-1">
                {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, total]) => (
                  <div key={m} className="flex justify-between text-xs">
                    <span className="text-stone-500">{METHOD_LABELS[m] || m}</span>
                    <span style={mono}>{formatREF(total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expected */}
          <div className="bg-stone-50 rounded-xl p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium">Efectivo esperado</p>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Bs</span>
              <span style={mono}>{expectedBs.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">USD</span>
              <span style={mono}>${expectedUsd.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-stone-400">(Inicial + ventas en efectivo)</p>
          </div>

          {/* Counted */}
          <div>
            <label className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium block mb-1">Efectivo contado Bs</label>
            <input type="number" step="0.01" value={countedBs} onChange={e => setCountedBs(e.target.value)} placeholder="0.00"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold" style={mono} />
            {countedBs && (
              <p className={`text-xs mt-1 font-medium ${diffColor(diffBs)}`} style={mono}>
                Diferencia: {diffBs >= 0 ? "+" : ""}{diffBs.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium block mb-1">Efectivo contado USD</label>
            <input type="number" step="0.01" value={countedUsd} onChange={e => setCountedUsd(e.target.value)} placeholder="0.00"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold" style={mono} />
            {countedUsd && (
              <p className={`text-xs mt-1 font-medium ${diffColor(diffUsd)}`} style={mono}>
                Diferencia: {diffUsd >= 0 ? "+" : ""}{diffUsd.toFixed(2)} USD
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium block mb-1">Notas (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-gold" placeholder="Observaciones del turno..." />
          </div>

          {error && <p className="text-xs text-danger font-medium">{error}</p>}

          <button onClick={handleClose} disabled={saving}
            className="w-full py-3 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors">
            {saving ? "Cerrando..." : "Cerrar turno"}
          </button>
        </div>
      </div>
    </div>
  );
}
