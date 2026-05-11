"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { X, AlertTriangle, ArrowRight, CheckCircle2, RotateCcw, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs, generateId } from "@/lib/utils";

function fmtConsumedAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function isWithin24h(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000;
}

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
  refund: "Refund",
  datafono: "Datafono",
};

export default function EventDetailModal({
  event,
  items,
  productsById,
  clientName,
  packageName,
  rate,
  canRegisterPayment,
  isAdmin,
  onClose,
  onRegisterPayment,
  onNavigateToInventario,
  onMarkConsumed,
  onReverted,
  onItemsChanged,
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
  const [consumptions, setConsumptions] = useState([]);
  const [loadingConsumptions, setLoadingConsumptions] = useState(true);
  const [reverting, setReverting] = useState(false);

  // Add-extra picker state
  const [showExtraPicker, setShowExtraPicker] = useState(false);
  const [cantinaProducts, setCantinaProducts] = useState([]);
  const [extraSearch, setExtraSearch] = useState("");
  const [extraQty, setExtraQty] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [addingExtra, setAddingExtra] = useState(false);

  // Client payments state (sprint UI 15)
  const [clientPayments, setClientPayments] = useState([]);
  const [loadingClientPayments, setLoadingClientPayments] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("pago_movil");
  const [payRef, setPayRef] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  // Combo + extras breakdown (sprint UI 14)
  const comboItems = useMemo(() => (items || []).filter((it) => !it.is_extra), [items]);
  const extraItems = useMemo(() => (items || []).filter((it) => it.is_extra), [items]);
  const comboSubtotal = useMemo(() => (items || []).reduce((s, it) => s + Number(it.price_ref || 0) * Number(it.quantity || 0), 0), [items]);

  const loadCantinaProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, price_ref, stock_quantity, category")
      .eq("is_cantina", true)
      .eq("active", true)
      .order("name");
    setCantinaProducts(data || []);
  }, []);

  const handleAddExtra = async () => {
    if (!selectedProduct || addingExtra) return;
    const qty = Math.max(1, Math.floor(Number(extraQty) || 1));
    setAddingExtra(true);
    const { error } = await supabase.from("event_items").insert({
      id: "ei_" + generateId(),
      event_id: event.id,
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      quantity: qty,
      price_ref: Number(selectedProduct.price_ref || 0),
      is_extra: true,
    });
    setAddingExtra(false);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    setShowExtraPicker(false);
    setExtraSearch("");
    setExtraQty(1);
    setSelectedProduct(null);
    if (onItemsChanged) await onItemsChanged();
  };

  const filteredCantina = useMemo(() => {
    const q = extraSearch.trim().toLowerCase();
    return cantinaProducts
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [cantinaProducts, extraSearch]);

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

  const loadConsumptions = useCallback(async () => {
    if (!supabase) return;
    setLoadingConsumptions(true);
    const { data } = await supabase
      .from("event_consumptions")
      .select("id, product_id, product_name, planned_qty, actual_qty, is_extra, created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });
    setConsumptions(data || []);
    setLoadingConsumptions(false);
  }, [event.id]);

  useEffect(() => { loadConsumptions(); }, [loadConsumptions]);

  useEffect(() => {
    if (showExtraPicker && cantinaProducts.length === 0) loadCantinaProducts();
  }, [showExtraPicker, cantinaProducts.length, loadCantinaProducts]);

  // Load client payments (CLIENT -> COMPLEJO) from payments table by booking_id
  const loadClientPayments = useCallback(async () => {
    if (!event.booking_id) {
      setClientPayments([]);
      setLoadingClientPayments(false);
      return;
    }
    setLoadingClientPayments(true);
    const { data } = await supabase
      .from("payments")
      .select("id, amount_eur, method, reference, created_at")
      .eq("booking_id", event.booking_id)
      .order("created_at", { ascending: false });
    setClientPayments(data || []);
    setLoadingClientPayments(false);
  }, [event.booking_id]);

  useEffect(() => { loadClientPayments(); }, [loadClientPayments]);

  // Totals
  const totalCombo = useMemo(() => (items || []).reduce((s, it) => s + Number(it.price_ref || 0) * Number(it.quantity || 0), 0), [items]);
  const totalPaidClient = useMemo(() => clientPayments.reduce((s, p) => {
    const amt = Number(p.amount_eur || 0);
    return p.method === "refund" ? s - amt : s + amt;
  }, 0), [clientPayments]);
  const remainingClient = Math.max(0, totalCombo - totalPaidClient);
  const clientStatus = totalCombo <= 0 ? "pending"
    : totalPaidClient >= totalCombo - 0.01 ? "paid"
    : totalPaidClient > 0 ? "partial"
    : "pending";

  const handleAddClientPayment = async (useTotal = false) => {
    if (savingPayment) return;
    const amt = useTotal ? remainingClient : Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Monto invalido");
      return;
    }
    if (!event.booking_id) {
      alert("Este evento no tiene booking asociado. No se puede registrar pago.");
      return;
    }
    setSavingPayment(true);
    const { error } = await supabase.from("payments").insert({
      id: "pay_" + Math.random().toString(36).slice(2, 12),
      booking_id: event.booking_id,
      amount_eur: amt,
      method: payMethod,
      reference: payRef.trim() || null,
    });
    setSavingPayment(false);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    setShowAddPayment(false);
    setPayAmount("");
    setPayRef("");
    setPayMethod("pago_movil");
    await loadClientPayments();
    if (onItemsChanged) await onItemsChanged();
  };

  const handleDeleteClientPayment = async (p) => {
    if (!isAdmin) return;
    if (!window.confirm("Borrar este pago? El cliente quedara debiendo el monto.")) return;
    const { error } = await supabase.from("payments").delete().eq("id", p.id);
    if (error) { alert("Error: " + error.message); return; }
    await loadClientPayments();
    if (onItemsChanged) await onItemsChanged();
  };

  const handleRevert = async () => {
    if (reverting) return;
    if (!window.confirm("Revertir consumo? El stock se va a restaurar.")) return;
    setReverting(true);
    const { data, error } = await supabase.rpc("revert_event_consumption", {
      p_event_id: event.id,
      p_reverted_by: event._user_name || "Cantina",
    });
    if (error) {
      alert("Error: " + error.message);
      setReverting(false);
      return;
    }
    if (!data?.success) {
      alert("Error: " + (data?.error || "no se pudo revertir"));
      setReverting(false);
      return;
    }
    setReverting(false);
    if (onReverted) await onReverted();
  };

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
          {/* Items del combo (sprint UI 14) */}
          <div className="px-5 pt-4 flex items-center justify-between">
            <h4 className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Items del combo</h4>
            <button
              onClick={() => setShowExtraPicker(true)}
              className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-semibold"
            >
              <Plus size={12} /> Agregar extra
            </button>
          </div>
          {comboItems.length === 0 && extraItems.length === 0 ? (
            <div className="px-5 pb-3 text-center text-stone-400 text-sm">Sin items registrados.</div>
          ) : (
            <table className="w-full text-sm mt-2">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Item</th>
                  <th className="text-right px-4 py-2 font-semibold">Cantidad</th>
                  <th className="text-right px-4 py-2 font-semibold">Precio Unit.</th>
                  <th className="text-right px-4 py-2 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {[...comboItems, ...extraItems].map((it) => {
                  const unit = Number(it.price_ref || 0);
                  const qty = Number(it.quantity || 0);
                  return (
                    <tr key={it.id} className={`border-t border-stone-100 ${it.is_extra ? "bg-amber-50/40" : ""}`}>
                      <td className="px-4 py-2 text-stone-700">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{it.product_name || "—"}</span>
                          {it.is_extra && (
                            <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">EXTRA</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-stone-700">{qty}</td>
                      <td className="px-4 py-2 text-right text-stone-600">{formatREF(unit)}</td>
                      <td className="px-4 py-2 text-right font-medium text-stone-800">{formatREF(unit * qty)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-stone-200 bg-stone-50">
                  <td colSpan={3} className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-stone-500">Subtotal combo</td>
                  <td className="px-4 py-2 text-right font-bold text-stone-800">{formatREF(comboSubtotal)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Inline picker for extra */}
          {showExtraPicker && (
            <div className="mx-5 mt-3 border border-stone-200 rounded-xl p-3 bg-stone-50/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">Agregar item extra cantina</span>
                <button onClick={() => { setShowExtraPicker(false); setSelectedProduct(null); setExtraSearch(""); setExtraQty(1); }} className="text-xs text-stone-500 hover:text-stone-700">Cancelar</button>
              </div>
              {!selectedProduct ? (
                <>
                  <div className="relative mb-2">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Buscar producto cantina..."
                      value={extraSearch}
                      onChange={(e) => setExtraSearch(e.target.value)}
                      className="w-full border border-stone-200 rounded-lg pl-7 pr-3 py-1.5 text-sm focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredCantina.length === 0 ? (
                      <p className="text-xs text-stone-400 text-center py-2">Sin resultados</p>
                    ) : filteredCantina.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        className="w-full text-left px-2 py-1.5 hover:bg-white rounded text-sm flex items-center justify-between"
                      >
                        <span className="text-stone-700">{p.name}</span>
                        <span className="text-[11px] text-stone-400">{formatREF(p.price_ref)} · stock {p.stock_quantity ?? "—"}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="bg-white border border-stone-200 rounded-lg p-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{selectedProduct.name}</p>
                      <p className="text-[11px] text-stone-400">{formatREF(selectedProduct.price_ref)}</p>
                    </div>
                    <button onClick={() => setSelectedProduct(null)} className="text-xs text-brand hover:underline">Cambiar</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-500">Cantidad:</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={extraQty}
                      onChange={(e) => setExtraQty(e.target.value)}
                      className="w-20 border border-stone-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand"
                    />
                    <span className="text-xs text-stone-500">Subtotal: {formatREF(Number(selectedProduct.price_ref || 0) * Math.max(1, Number(extraQty) || 1))}</span>
                  </div>
                  <button
                    onClick={handleAddExtra}
                    disabled={addingExtra}
                    className="w-full py-2 rounded-lg bg-brand text-white text-sm font-bold hover:bg-brand-dark disabled:opacity-50"
                  >
                    {addingExtra ? "Agregando..." : "Agregar extra"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Resumen de Totales + Pagos del cliente (sprint UI 15) */}
          <div className="px-5 pt-5">
            <div className="bg-amber-50/40 border border-amber-300 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-stone-800">Resumen de Totales</h3>
                {clientStatus === "paid" ? (
                  <span className="inline-block bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Pagado</span>
                ) : clientStatus === "partial" ? (
                  <span className="inline-block bg-violet-100 text-violet-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Parcial</span>
                ) : (
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Pendiente</span>
                )}
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-stone-600">Subtotal Combo:</span>
                  <span className="font-medium text-stone-800">{formatREF(totalCombo)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-amber-200">
                  <span className="text-stone-800">TOTAL:</span>
                  <span className="text-right">
                    <span className="text-stone-800 block">{formatREF(totalCombo)}</span>
                    <span className="text-xs text-stone-500 font-normal">{formatBs(totalCombo, rate?.eur)}</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Pagado:</span>
                  <span className="font-medium text-stone-800">{formatREF(totalPaidClient)}</span>
                </div>
                {remainingClient > 0.01 && (
                  <div className="flex justify-between font-bold pt-1 border-t border-amber-200">
                    <span className="text-red-700">RESTA:</span>
                    <span className="text-right">
                      <span className="text-red-700 block">{formatREF(remainingClient)}</span>
                      <span className="text-xs text-red-500 font-normal">{formatBs(remainingClient, rate?.eur)}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pagos del cliente */}
          <div className="px-5 pt-5">
            <h4 className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Pagos</h4>
          </div>
          {loadingClientPayments ? (
            <div className="px-5 pb-4 text-center text-stone-400 text-sm animate-pulse">Cargando pagos...</div>
          ) : clientPayments.length === 0 ? (
            <div className="px-5 pb-2 text-center text-stone-400 text-sm">No hay pagos registrados</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Fecha</th>
                  <th className="text-left px-4 py-2 font-semibold">Metodo</th>
                  <th className="text-right px-4 py-2 font-semibold">Monto REF</th>
                  <th className="text-left px-4 py-2 font-semibold">Ref</th>
                  {isAdmin && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {clientPayments.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className="px-4 py-2 text-stone-700">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-2 text-stone-600">{METHOD_LABELS[p.method] || p.method || "—"}</td>
                    <td className="px-4 py-2 text-right font-medium text-stone-800">
                      {p.method === "refund" ? `- ${formatREF(p.amount_eur)}` : formatREF(p.amount_eur)}
                    </td>
                    <td className="px-4 py-2 text-stone-500 text-xs">{p.reference || "—"}</td>
                    {isAdmin && (
                      <td className="px-2 py-2 text-right">
                        <button onClick={() => handleDeleteClientPayment(p)} className="text-stone-400 hover:text-red-500 p-1" title="Borrar pago">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Botones de accion pagos */}
          {event.booking_id && (
            <div className="px-5 pt-3 pb-1">
              {!showAddPayment ? (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => { setShowAddPayment(true); setPayAmount(""); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-brand text-brand rounded-lg text-xs font-bold hover:bg-brand/5"
                  >
                    <Plus size={12} /> Agregar Pago
                  </button>
                  {remainingClient > 0.01 && (
                    <button
                      onClick={() => { setShowAddPayment(true); setPayAmount(remainingClient.toFixed(2)); }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark"
                    >
                      $ Pagar Total ({formatREF(remainingClient)})
                    </button>
                  )}
                </div>
              ) : (
                <div className="border border-stone-200 rounded-xl p-3 bg-stone-50/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500">Registrar pago</span>
                    <button onClick={() => { setShowAddPayment(false); setPayAmount(""); setPayRef(""); }} className="text-xs text-stone-500 hover:text-stone-700">Cancelar</button>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Monto REF</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-base font-medium focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Metodo</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="pago_movil">Pago Movil</option>
                      <option value="zelle">Zelle</option>
                      <option value="cash_usd">Cash USD</option>
                      <option value="cash_bs">Cash Bs</option>
                      <option value="refund">Refund</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-1">Referencia (opcional)</label>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="Numero de referencia"
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
                    />
                  </div>
                  <button
                    onClick={() => handleAddClientPayment(false)}
                    disabled={savingPayment}
                    className="w-full py-2 rounded-lg bg-brand text-white text-sm font-bold hover:bg-brand-dark disabled:opacity-50"
                  >
                    {savingPayment ? "Guardando..." : "Confirmar pago"}
                  </button>
                </div>
              )}
            </div>
          )}

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

          {/* Consumption */}
          <div className="px-5 pt-5">
            <h4 className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Consumo</h4>
          </div>
          {!event.is_consumed ? (
            <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                Pendiente de marcar consumido
              </span>
              <button
                onClick={() => onMarkConsumed && onMarkConsumed()}
                className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand-dark"
              >
                <CheckCircle2 size={14} /> Marcar evento celebrado
              </button>
            </div>
          ) : (
            <>
              <div className="px-5 pb-2 flex items-center gap-2 flex-wrap text-sm">
                <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> Consumido el {fmtConsumedAt(event.consumed_at)} por {event.consumed_by || "—"}
                </span>
                {isAdmin && isWithin24h(event.consumed_at) && (
                  <button
                    onClick={handleRevert}
                    disabled={reverting}
                    className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 border-2 border-stone-200 text-stone-600 text-xs font-medium rounded-lg hover:bg-stone-50 disabled:opacity-50"
                  >
                    <RotateCcw size={12} /> {reverting ? "Revirtiendo..." : "Revertir consumo"}
                  </button>
                )}
              </div>
              {loadingConsumptions ? (
                <div className="px-5 pb-4 text-center text-stone-400 text-sm animate-pulse">Cargando consumos...</div>
              ) : consumptions.length === 0 ? (
                <div className="px-5 pb-4 text-center text-stone-400 text-sm">Sin items consumidos registrados.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">Producto</th>
                      <th className="text-right px-4 py-2 font-semibold">Plan</th>
                      <th className="text-right px-4 py-2 font-semibold">Real</th>
                      <th className="text-right px-4 py-2 font-semibold">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumptions.map((c) => {
                      const diff = Number(c.actual_qty) - Number(c.planned_qty);
                      const diffColor = diff > 0 ? "text-amber-700" : diff < 0 ? "text-blue-700" : "text-stone-500";
                      return (
                        <tr key={c.id} className="border-t border-stone-100">
                          <td className="px-4 py-2.5 text-stone-700">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{c.product_name}</span>
                              {c.is_extra && (
                                <span className="text-[10px] font-semibold bg-gold/10 text-gold px-1.5 py-0.5 rounded">EXTRA</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-stone-500">{c.planned_qty}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-stone-800">{c.actual_qty}</td>
                          <td className={`px-4 py-2.5 text-right ${diffColor}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
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
