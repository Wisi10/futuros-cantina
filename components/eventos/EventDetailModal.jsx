"use client";
import { useEffect, useState, useCallback } from "react";
import { X, AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs } from "@/lib/utils";

function stockState(stockQty, requiredQty) {
  if (stockQty == null) return { kind: "missing", label: "no en catalogo", chip: "bg-stone-100 text-stone-500", icon: "⚫" };
  if (stockQty < requiredQty) return { kind: "red", label: `${stockQty} disp.`, chip: "bg-red-100 text-red-700", icon: "🔴" };
  if (stockQty < requiredQty * 2) return { kind: "yellow", label: `${stockQty} disp.`, chip: "bg-amber-100 text-amber-700", icon: "🟡" };
  return { kind: "green", label: `${stockQty} disp.`, chip: "bg-green-100 text-green-700", icon: "✅" };
}

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

const METHOD_LABELS = {
  transferencia: "Transferencia",
  pago_movil: "Pago Movil",
  cash_bs: "Efectivo Bs",
  cash_usd: "Cash USD",
  zelle: "Zelle",
};

export default function EventDetailModal({
  event,
  items,
  productsById,
  clientName,
  packageName,
  rate,
  canRegisterPayment,
  onClose,
  onRegisterPayment,
  onNavigateToInventario,
}) {
  const rows = items
    .filter((it) => productsById[it.product_id]?.is_cantina === true)
    .map((it) => {
      const product = productsById[it.product_id];
      const cost = Number(product?.cost_ref || 0);
      const stockQty = product ? Number(product.stock_quantity || 0) : null;
      const required = Number(it.quantity || 0);
      const stock = stockState(stockQty, required);
      return { ...it, cost, subtotal: cost * required, stockQty, stock };
    });
  const owedRef = rows.reduce((s, r) => s + r.subtotal, 0);

  const stockAlerts = rows.filter((r) => r.stock.kind === "red" || r.stock.kind === "yellow" || r.stock.kind === "missing");
  const insufficientItems = rows.filter((r) => r.stock.kind === "red");
  const justItems = rows.filter((r) => r.stock.kind === "yellow");
  const orphanItems = rows.filter((r) => r.stock.kind === "missing");

  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  const loadPayments = useCallback(async () => {
    if (!supabase) return;
    setLoadingPayments(true);
    const { data } = await supabase
      .from("event_payments")
      .select("id, amount_ref, transfer_id, notes, created_by, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false });
    const payList = data || [];
    const transferIds = [...new Set(payList.map((p) => p.transfer_id).filter(Boolean))];
    let methodMap = {};
    if (transferIds.length) {
      const { data: trs } = await supabase
        .from("intercompany_transfers")
        .select("id, payment_method")
        .in("id", transferIds);
      (trs || []).forEach((t) => { methodMap[t.id] = t.payment_method; });
    }
    setPayments(payList.map((p) => ({ ...p, method: methodMap[p.transfer_id] || null })));
    setLoadingPayments(false);
  }, [event.id]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const paidRef = payments.reduce((s, p) => s + Number(p.amount_ref || 0), 0);
  const remaining = Math.max(owedRef - paidRef, 0);
  const isSettled = event.is_settled || (owedRef > 0 && paidRef >= owedRef - 0.01);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div>
            <div className="text-xs text-stone-500 mb-1">Evento</div>
            <div className="text-lg font-bold text-stone-800">{fmtDate(event.event_date)} — {clientName}</div>
            <div className="text-sm text-stone-500 capitalize">Paquete: {packageName}</div>
            {isSettled && (
              <div className="mt-1 inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                Saldado{event.settled_at ? ` el ${fmtDateTime(event.settled_at)}` : ""}
              </div>
            )}
            {!isSettled && paidRef > 0 && (
              <div className="mt-1 inline-block bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                Parcial
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Stock alerts banner */}
          {stockAlerts.length > 0 && (
            <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-700 mt-0.5 shrink-0" />
                <div className="flex-1 text-xs text-amber-900 space-y-1">
                  <div className="font-semibold">Atencion stock:</div>
                  {insufficientItems.length > 0 && (
                    <div>
                      {insufficientItems.length} producto{insufficientItems.length !== 1 ? "s" : ""} con stock insuficiente:{" "}
                      {insufficientItems.map((r) => `${r.product_name} (faltan ${Math.max(0, Number(r.quantity || 0) - Number(r.stockQty || 0))})`).join(", ")}
                    </div>
                  )}
                  {justItems.length > 0 && (
                    <div>
                      {justItems.length} producto{justItems.length !== 1 ? "s" : ""} justo: {justItems.map((r) => r.product_name).join(", ")}
                    </div>
                  )}
                  {orphanItems.length > 0 && (
                    <div>
                      {orphanItems.length} producto{orphanItems.length !== 1 ? "s" : ""} sin catalogo: {orphanItems.map((r) => r.product_name).join(", ")}
                    </div>
                  )}
                </div>
                {onNavigateToInventario && (
                  <button
                    onClick={() => { onNavigateToInventario(); onClose(); }}
                    className="inline-flex items-center gap-1 text-xs text-amber-800 hover:text-amber-900 font-semibold whitespace-nowrap"
                  >
                    Ir a Inventario <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="px-5 pt-4">
            <h4 className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Insumos cantina</h4>
          </div>
          {rows.length === 0 ? (
            <div className="px-5 pb-4 text-center text-stone-400 text-sm">Este evento no tiene items de cantina</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Producto</th>
                  <th className="text-right px-4 py-2 font-semibold">Cant</th>
                  <th className="text-right px-4 py-2 font-semibold">Costo unit</th>
                  <th className="text-right px-4 py-2 font-semibold">Subtotal</th>
                  <th className="text-center px-4 py-2 font-semibold">Stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-stone-100 ${r.cost === 0 ? "bg-amber-50/40" : ""}`}>
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
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.stock.chip}`}>
                        <span>{r.stock.icon}</span>
                        <span>{r.stock.label}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Payments */}
          <div className="px-5 pt-5">
            <h4 className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Abonos a cantina</h4>
          </div>
          {loadingPayments ? (
            <div className="px-5 pb-4 text-center text-stone-400 text-sm animate-pulse">Cargando abonos...</div>
          ) : payments.length === 0 ? (
            <div className="px-5 pb-4 text-center text-stone-400 text-sm">Aun no hay abonos registrados.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Fecha</th>
                  <th className="text-left px-4 py-2 font-semibold">Metodo</th>
                  <th className="text-left px-4 py-2 font-semibold">Por</th>
                  <th className="text-right px-4 py-2 font-semibold">Monto REF</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="px-4 py-2.5 text-stone-700">{fmtDateTime(p.created_at)}</td>
                    <td className="px-4 py-2.5 text-stone-600">{METHOD_LABELS[p.method] || p.method || "—"}</td>
                    <td className="px-4 py-2.5 text-stone-600">{p.created_by || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-stone-800">{formatREF(p.amount_ref)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Totals + actions */}
        <div className="border-t border-stone-200 p-4 md:p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-stone-50 rounded-lg p-2">
              <div className="text-stone-500">Costo</div>
              <div className="font-semibold text-stone-800">{formatREF(owedRef)}</div>
            </div>
            <div className="bg-stone-50 rounded-lg p-2">
              <div className="text-stone-500">Pagado</div>
              <div className="font-semibold text-stone-800">{formatREF(paidRef)}</div>
            </div>
            <div className={`rounded-lg p-2 ${remaining > 0 ? "bg-amber-50" : "bg-green-50"}`}>
              <div className="text-stone-500">Saldo</div>
              <div className={`font-semibold ${remaining > 0 ? "text-amber-800" : "text-green-800"}`}>{formatREF(remaining)}</div>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-sm text-stone-500">Total a cantina</span>
            <div className="text-right">
              <div className="text-2xl font-bold text-brand">{formatREF(owedRef)}</div>
              <div className="text-xs text-stone-500">{formatBs(owedRef, rate?.eur)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50"
            >
              Cerrar
            </button>
            {canRegisterPayment && (
              <button
                onClick={() => onRegisterPayment({ owedRef, paidRef })}
                disabled={isSettled}
                className="flex-1 py-2.5 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSettled
                  ? "Ya saldado"
                  : owedRef <= 0
                    ? "Cerrar evento"
                    : "Registrar abono"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
