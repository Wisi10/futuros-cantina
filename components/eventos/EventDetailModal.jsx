"use client";
import { X, AlertTriangle } from "lucide-react";
import { formatREF, formatBs } from "@/lib/utils";

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function EventDetailModal({ event, items, productsById, clientName, packageName, rate, onClose, onMarkSettled }) {
  const rows = items.map((it) => {
    const cost = Number(productsById[it.product_id]?.cost_ref || 0);
    return { ...it, cost, subtotal: cost * Number(it.quantity || 0) };
  });
  const totalRef = rows.reduce((s, r) => s + r.subtotal, 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div>
            <div className="text-xs text-stone-500 mb-1">Evento</div>
            <div className="text-lg font-bold text-stone-800">{fmtDate(event.event_date)} — {clientName}</div>
            <div className="text-sm text-stone-500 capitalize">Paquete: {packageName}</div>
            {event.is_settled && (
              <div className="mt-1 inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                Saldado el {fmtDateTime(event.settled_at)}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Items table */}
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-stone-400 text-sm">Este evento no tiene items cargados.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Producto</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Cant</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Costo unit</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-stone-100 ${r.cost === 0 ? "bg-amber-50" : ""}`}>
                    <td className="px-4 py-2.5 text-stone-700">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{r.product_name || "—"}</span>
                        {r.cost === 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                            <AlertTriangle size={10} /> Costo no cargado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-stone-700">{r.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-stone-600">{formatREF(r.cost)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-stone-800">{formatREF(r.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Total + actions */}
        <div className="border-t border-stone-200 p-4 md:p-5 space-y-3">
          <div className="flex items-end justify-between">
            <span className="text-sm text-stone-500">Total</span>
            <div className="text-right">
              <div className="text-2xl font-bold text-brand">{formatREF(totalRef)}</div>
              <div className="text-xs text-stone-500">{formatBs(totalRef, rate?.eur)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50"
            >
              Cerrar
            </button>
            <button
              onClick={onMarkSettled}
              disabled={event.is_settled}
              className="flex-1 py-2.5 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {event.is_settled ? "Ya saldado" : "Marcar saldado"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
