"use client";
import { useMemo } from "react";
import { X, AlertTriangle, Calendar, History, DollarSign } from "lucide-react";

function daysUntil(dueDate) {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

// Modal con detalle completo de la deuda con un proveedor.
// Muestra: facturas con productos + fechas + vencimientos, historial de pagos hechos,
// y un solo botón "Registrar pago" que abre RestockPaymentModal con TODOS los restocks.
export default function SupplierDebtModal({ supplier, restocks, paymentsByRestock, usdRate, onClose, onPay }) {
  const totalDebt = useMemo(
    () => restocks.reduce((s, r) => s + Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0)), 0),
    [restocks]
  );
  const totalOriginal = useMemo(
    () => restocks.reduce((s, r) => s + Number(r.total_cost_ref || 0), 0),
    [restocks]
  );
  const totalPaid = totalOriginal - totalDebt;

  const hasOverdue = restocks.some((r) => r.due_date && daysUntil(r.due_date) < 0);

  // Sort: vencidas primero, luego por fecha de vencimiento ascendente.
  const sortedRestocks = useMemo(() => {
    return [...restocks].sort((a, b) => {
      const aDue = a.due_date ? daysUntil(a.due_date) : 999;
      const bDue = b.due_date ? daysUntil(b.due_date) : 999;
      return aDue - bDue;
    });
  }, [restocks]);

  // Todos los pagos hechos (combinado, ordenado por fecha desc).
  const allPayments = useMemo(() => {
    const all = [];
    for (const r of restocks) {
      const list = paymentsByRestock?.[r.id] || [];
      for (const p of list) {
        all.push({ ...p, restock_date: r.restock_date });
      }
    }
    return all.sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || ""));
  }, [restocks, paymentsByRestock]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div className="min-w-0">
            <div className="text-xs text-stone-500 mb-1">Proveedor</div>
            <div className="text-lg font-bold text-stone-800 truncate">{supplier}</div>
            <div className="text-sm text-stone-500">
              {restocks.length} factura{restocks.length !== 1 ? "s" : ""}
              {hasOverdue && (
                <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-medium">
                  <AlertTriangle size={11} /> con vencidos
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Resumen monetario */}
        <div className="px-5 py-3 bg-stone-50 border-b border-stone-200 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Original</div>
            <div className="text-sm font-bold text-stone-700 mt-0.5">${totalOriginal.toFixed(2)}</div>
            {usdRate && <div className="text-[10px] text-stone-400">Bs {(totalOriginal * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Pagado</div>
            <div className="text-sm font-bold text-green-700 mt-0.5">${totalPaid.toFixed(2)}</div>
            {usdRate && <div className="text-[10px] text-stone-400">Bs {(totalPaid * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>}
          </div>
          <div className="border-l border-stone-200">
            <div className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">Adeudado</div>
            <div className="text-base font-bold text-brand mt-0.5">${totalDebt.toFixed(2)}</div>
            {usdRate && <div className="text-[10px] text-stone-500">Bs {(totalDebt * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>}
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto">
          {/* Facturas */}
          <div className="px-5 pt-4">
            <h4 className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Facturas pendientes</h4>
            <div className="space-y-2">
              {sortedRestocks.map((r) => {
                const owed = Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0));
                const overdueDays = r.due_date ? -daysUntil(r.due_date) : null;
                const isOverdue = overdueDays != null && overdueDays > 0;
                const isPartial = r.payment_status === "partial";
                return (
                  <div
                    key={r.id}
                    className={`border rounded-xl p-3 ${isOverdue ? "border-red-200 bg-red-50/40" : "border-stone-200 bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-stone-500 font-medium">{r.restock_date}</span>
                          {isPartial && (
                            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-[10px] uppercase tracking-wider font-bold">
                              Parcial · pagado ${Number(r.paid_amount_ref || 0).toFixed(2)}
                            </span>
                          )}
                        </div>
                        {Array.isArray(r.items) && r.items.length > 0 && (
                          <div className="text-xs text-stone-700 mt-1">
                            {r.items.map((it) => `${it.name || "?"} ×${it.qty || 0}`).join(", ")}
                          </div>
                        )}
                        {r.notes && (
                          <div className="text-[11px] text-stone-400 italic mt-0.5" title={r.notes}>
                            {r.notes}
                          </div>
                        )}
                        {r.due_date && (
                          <div className={`mt-1 inline-flex items-center gap-1 text-[11px] ${isOverdue ? "text-red-600 font-bold" : "text-stone-500"}`}>
                            <Calendar size={10} />
                            Vence: {r.due_date}
                            {isOverdue && <> · VENCIDO {overdueDays} día{overdueDays !== 1 ? "s" : ""}</>}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-stone-800 text-sm">${owed.toFixed(2)}</div>
                        {usdRate && (
                          <div className="text-[10px] text-stone-500">Bs {(owed * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Historial de pagos */}
          {allPayments.length > 0 && (
            <div className="px-5 pt-5 pb-3">
              <h4 className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2 flex items-center gap-1">
                <History size={11} /> Pagos hechos ({allPayments.length})
              </h4>
              <div className="space-y-1 bg-stone-50 rounded-xl p-3">
                {allPayments.map((p) => (
                  <div key={p.id} className="text-xs flex items-center justify-between gap-2 py-1 border-b border-stone-100 last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-stone-700 font-medium">{p.paid_at}</span>
                      <span className="text-stone-500">{p.payment_method}</span>
                      {p.reference && <span className="text-stone-400">ref {p.reference}</span>}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-700">${Number(p.amount_ref).toFixed(2)}</div>
                      {p.amount_bs != null && (
                        <div className="text-[10px] text-stone-500">Bs {Number(p.amount_bs).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer con CTA */}
        <div className="p-4 border-t border-stone-200 bg-white flex items-center justify-between gap-3">
          <div className="text-xs text-stone-500">
            Pago total o parcial — se distribuye entre facturas (vencidas primero)
          </div>
          <button
            onClick={onPay}
            className="px-4 py-2.5 bg-brand text-white hover:bg-brand-dark rounded-lg text-sm font-bold flex items-center gap-2 shrink-0"
          >
            <DollarSign size={14} /> Registrar pago a {supplier}
          </button>
        </div>
      </div>
    </div>
  );
}
