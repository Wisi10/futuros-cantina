"use client";
import { useState, useMemo, useEffect } from "react";
import { X, DollarSign, Loader2, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Modal para registrar pago contra un restock pendiente (lado proveedor).
// Mismo pattern canónico que cantina_credits/cantina_credit_payments del
// lado cliente: deuda en $REF locked + tabla pagos 1:N.

// needsRef: bloquea guardar si vacio. acceptsRef: muestra input opcional.
// Distinto del PAYMENT_METHODS global (lib/utils.js) porque acá los metodos
// son lado proveedor (incluye Transferencia, no incluye Tarjeta).
const PAYMENT_METHODS = [
  { id: "transferencia", label: "Transferencia", acceptsRef: true, refHint: "Nº transferencia" },
  { id: "pago_movil", label: "Pago Móvil", acceptsRef: true, refHint: "Últimos 4 dígitos" },
  { id: "zelle", label: "Zelle", needsRef: true, acceptsRef: true, refHint: "Email o ref" },
  { id: "cash_usd", label: "Efectivo USD" },
  { id: "cash_bs", label: "Efectivo Bs" },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Soporta single-factura (restock prop) o multi-factura (restocks prop array).
// En multi-factura: agrega outstandings de todas las facturas del MISMO proveedor.
// Al pagar, distribuye proporcionalmente entre las facturas para cubrir exact
// outstanding de cada una (versión simple — no permite parcial en multi).
export default function RestockPaymentModal({ restock, restocks, payments = [], rate, user, onClose, onPaid }) {
  const restockArr = restocks && restocks.length > 0 ? restocks : (restock ? [restock] : []);
  const isMulti = restockArr.length > 1;
  // Por consistencia con código previo, mantengo `restock` apuntando al primero.
  // En multi-factura usamos los agregados.
  const firstRestock = restockArr[0] || {};
  const supplierName = firstRestock.supplier || "Sin proveedor";
  const total = restockArr.reduce((s, r) => s + Number(r.total_cost_ref || 0), 0);
  const alreadyPaid = restockArr.reduce((s, r) => s + Number(r.paid_amount_ref || 0), 0);
  const outstanding = Math.max(0, total - alreadyPaid);

  // Tasa default: la del día (de exchange_rates via rate prop). Editable por staff
  // (el usuario pidió esto explicitamente — la tasa puede no ser la del dia
  // si el pago se hizo otro día).
  const todaysRate = rate?.usd || rate?.eur || "";

  const [amount, setAmount] = useState(String(outstanding.toFixed(2)));
  // Multi-factura: amounts editables por factura (key = restock.id).
  // Default a outstanding de cada una. Staff puede ajustar/cero por row.
  const [perInvoiceAmounts, setPerInvoiceAmounts] = useState(() => {
    const m = {};
    restockArr.forEach((r) => {
      const out = Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0));
      m[r.id] = out.toFixed(2);
    });
    return m;
  });
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [exchangeRate, setExchangeRate] = useState(String(todaysRate || ""));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // En single usamos `amount`. En multi sumamos perInvoiceAmounts para el total.
  const multiTotal = isMulti
    ? Object.values(perInvoiceAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)
    : 0;
  const amountNum = isMulti ? multiTotal : (parseFloat(amount) || 0);
  const usesRate = method === "pago_movil" || method === "cash_bs" || method === "transferencia";
  const rateNum = parseFloat(exchangeRate) || 0;
  const amountBs = usesRate && rateNum > 0 ? amountNum * rateNum : null;

  // En multi se permite overpay por row (proveedor pudo subir precio post-entrega).
  // Solo bloqueamos negativos. Cada row marca su propio overpay para UI.
  const multiOverpayRows = isMulti
    ? restockArr.filter((r) => {
        const out = Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0));
        const paid = parseFloat(perInvoiceAmounts[r.id]) || 0;
        return paid > out + 0.005;
      })
    : [];
  const multiInvalidRow = isMulti && restockArr.some((r) => (parseFloat(perInvoiceAmounts[r.id]) || 0) < 0);

  const isFullPayment = amountNum >= outstanding - 0.005;
  // Overpay solo disponible en single-factura (en multi, distribución compleja).
  const isOverpay = !isMulti && amountNum > outstanding + 0.005;
  const overpayDelta = isOverpay ? amountNum - outstanding : 0;
  const newStatus = isFullPayment || isOverpay ? "paid" : amountNum > 0 ? "partial" : (firstRestock.payment_status || "pending");

  // Si proveedor cobró más de lo estimado, el staff confirma si actualizar
  // los precios de los productos del restock (forward-only). Default ON
  // cuando hay overpay, OFF cuando es pago normal.
  const [updatePrices, setUpdatePrices] = useState(false);
  // Auto-marcar updatePrices cuando aparece overpay (single o multi). UX hint;
  // el staff puede destildear si fue un typo.
  useEffect(() => {
    setUpdatePrices(isOverpay || multiOverpayRows.length > 0);
  }, [isOverpay, multiOverpayRows.length]);

  // Ya no bloqueamos overpay en single (escenario "proveedor subió el precio").
  // En multi sí bloqueamos si algún row excede su outstanding.
  const canSubmit = amountNum > 0 && !saving && !multiInvalidRow;

  // Categorizar gasto a partir de los items de un restock
  const deriveExpenseCategory = (restockItems) => {
    const categories = new Set();
    restockItems.forEach((it) => {
      const pc = it?.category || it?.product_category;
      if (pc === "Bebida") categories.add("Insumos cantina · Bebida");
      else if (pc === "Comida") categories.add("Insumos cantina · Comida");
      else if (pc === "Snacks") categories.add("Insumos cantina · Snacks");
      else if (pc === "Helados") categories.add("Insumos cantina · Helados");
      else if (pc === "Insumos") categories.add("Insumos cantina · Empaques");
      else categories.add("Insumos cantina · Otros");
    });
    return categories.size === 1 ? [...categories][0] : "Insumos cantina · Otros";
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");

    try {
      if (isMulti) {
        // ─── MULTI-FACTURA: cada factura tiene su amount editable. Permite overpay
        // por row (proveedor pudo subir precio). Si updatePrices=ON, para cada row
        // con overpay se ajusta total_cost_ref y se actualizan los precios de los
        // productos de esa factura + audit stock_movement.
        const paymentInserts = [];
        const restockUpdates = [];
        const priceAdjustments = []; // { restock, newTotal, factor }
        for (const r of restockArr) {
          const allocated = parseFloat(perInvoiceAmounts[r.id]) || 0;
          if (allocated <= 0) continue;
          const oldPaid = Number(r.paid_amount_ref || 0);
          const oldTotal = Number(r.total_cost_ref || 0);
          const outstandingR = Math.max(0, oldTotal - oldPaid);
          const rowOverpay = allocated > outstandingR + 0.005;
          const newPaid = oldPaid + allocated;
          const newTotal = rowOverpay ? newPaid : oldTotal;
          paymentInserts.push({
            restock_id: r.id,
            amount_ref: allocated,
            amount_bs: usesRate && rateNum > 0 ? allocated * rateNum : null,
            payment_method: method,
            reference: reference.trim() || null,
            exchange_rate_bs: usesRate && rateNum > 0 ? rateNum : null,
            paid_at: paidAt,
            notes: notes.trim() ? `${notes.trim()} (pago combinado ${restockArr.length} facturas)` : `Pago combinado ${restockArr.length} facturas del proveedor`,
            created_by: user?.name || "Cantina",
          });
          const status = newPaid >= newTotal - 0.005 ? "paid" : "partial";
          restockUpdates.push({
            id: r.id,
            paid_amount_ref: newPaid,
            payment_status: status,
            ...(rowOverpay ? { total_cost_ref: newTotal } : {}),
          });
          if (rowOverpay && updatePrices) {
            const factor = oldTotal > 0 ? newTotal / oldTotal : 1;
            priceAdjustments.push({ restock: r, newTotal, factor });
          }
        }

        if (paymentInserts.length === 0) throw new Error("Todos los montos están en 0 — nada que pagar");

        const { error: payErr } = await supabase.from("cantina_restock_payments").insert(paymentInserts);
        if (payErr) throw payErr;

        for (const u of restockUpdates) {
          const upPayload = { paid_amount_ref: u.paid_amount_ref, payment_status: u.payment_status };
          if (u.total_cost_ref != null) upPayload.total_cost_ref = u.total_cost_ref;
          const { error: upErr } = await supabase
            .from("cantina_restocks")
            .update(upPayload)
            .eq("id", u.id);
          if (upErr) throw upErr;
        }

        // Ajustes de precio para rows con overpay (forward-only, audit en stock_movements)
        for (const adj of priceAdjustments) {
          const items = Array.isArray(adj.restock.items) ? adj.restock.items : [];
          for (const it of items) {
            if (!it?.product_id || !it?.cost_per_unit_ref) continue;
            const oldCostU = Number(it.cost_per_unit_ref);
            const newCostU = oldCostU * adj.factor;
            await supabase.from("products").update({ cost_ref: newCostU }).eq("id", it.product_id);
            await supabase.from("stock_movements").insert({
              product_id: it.product_id,
              product_name: it.name || "(producto)",
              movement_type: "adjustment",
              quantity: 0,
              reference_id: adj.restock.id,
              cost_ref: newCostU,
              notes: `⚠️ Precio actualizado por factura final: $${oldCostU.toFixed(4)} → $${newCostU.toFixed(4)} (proveedor ${adj.restock.supplier || "?"}, pago combinado)`,
              created_by: user?.name || "Cantina",
            });
          }
        }

        // 1 expense agregando todo el pago
        const allItems = restockArr.flatMap((r) => Array.isArray(r.items) ? r.items : []);
        const expenseCategory = deriveExpenseCategory(allItems);
        try {
          await supabase.from("expenses").insert({
            id: "exp_" + Math.random().toString(36).slice(2, 12),
            expense_type: "variable",
            category: expenseCategory,
            name: `Pago combinado ${restockArr.length} facturas · ${supplierName}`,
            amount_usd: amountNum,
            amount_bs: amountBs,
            exchange_rate: usesRate && rateNum > 0 ? rateNum : null,
            payment_method: method,
            reference: reference.trim() || null,
            provider: supplierName,
            expense_date: paidAt,
            created_by: user?.name || "Cantina",
            notes: `Pago a ${restockArr.length} facturas: ${restockArr.map((r) => r.id).join(", ")}${notes ? ` · ${notes}` : ""}`,
          });
        } catch (linkErr) {
          console.error("[MULTI_PAYMENT→GASTO]", linkErr);
        }

        if (onPaid) onPaid();
        return;
      }

      // ─── SINGLE-FACTURA: flujo previo intacto (incluye overpay + updatePrices)
      const singleRestock = firstRestock;
      const { error: payErr } = await supabase.from("cantina_restock_payments").insert({
        restock_id: singleRestock.id,
        amount_ref: amountNum,
        amount_bs: amountBs,
        payment_method: method,
        reference: reference.trim() || null,
        exchange_rate_bs: usesRate && rateNum > 0 ? rateNum : null,
        paid_at: paidAt,
        notes: notes.trim() || null,
        created_by: user?.name || "Cantina",
      });
      if (payErr) throw payErr;

      const newPaid = alreadyPaid + amountNum;
      const newTotal = isOverpay ? newPaid : Number(singleRestock.total_cost_ref || 0);
      const restockUpdate = { paid_amount_ref: newPaid, payment_status: newStatus };
      if (isOverpay) restockUpdate.total_cost_ref = newTotal;
      const { error: upErr } = await supabase
        .from("cantina_restocks")
        .update(restockUpdate)
        .eq("id", singleRestock.id);
      if (upErr) throw upErr;

      if (isOverpay && updatePrices) {
        const oldTotal = Number(singleRestock.total_cost_ref || 0);
        const factor = oldTotal > 0 ? newTotal / oldTotal : 1;
        const restockItems = Array.isArray(singleRestock.items) ? singleRestock.items : [];
        for (const it of restockItems) {
          if (!it?.product_id || !it?.cost_per_unit_ref) continue;
          const oldCostU = Number(it.cost_per_unit_ref);
          const newCostU = oldCostU * factor;
          await supabase.from("products").update({ cost_ref: newCostU }).eq("id", it.product_id);
          await supabase.from("stock_movements").insert({
            product_id: it.product_id,
            product_name: it.name || "(producto)",
            movement_type: "adjustment",
            quantity: 0,
            reference_id: singleRestock.id,
            cost_ref: newCostU,
            notes: `⚠️ Precio actualizado por factura final: $${oldCostU.toFixed(4)} → $${newCostU.toFixed(4)} (proveedor ${singleRestock.supplier || "?"})`,
            created_by: user?.name || "Cantina",
          });
        }
      }

      try {
        const restockItems = Array.isArray(singleRestock.items) ? singleRestock.items : [];
        const expenseCategory = deriveExpenseCategory(restockItems);
        const { error: expErr } = await supabase.from("expenses").insert({
          id: "exp_" + Math.random().toString(36).slice(2, 12),
          expense_type: "variable",
          category: expenseCategory,
          name: `Pago factura ${singleRestock.supplier || "proveedor"}${isFullPayment ? "" : " (parcial)"}`,
          amount_usd: amountNum,
          amount_bs: amountBs,
          exchange_rate: usesRate && rateNum > 0 ? rateNum : null,
          payment_method: method,
          reference: reference.trim() || null,
          provider: singleRestock.supplier || null,
          expense_date: paidAt,
          created_by: user?.name || "Cantina",
          notes: `Pago contra restock ${singleRestock.id}${notes ? ` · ${notes}` : ""}`,
        });
        if (expErr) console.error("[INVOICE_PAYMENT→GASTO]", expErr);
      } catch (linkErr) {
        console.error("[INVOICE_PAYMENT→GASTO]", linkErr);
      }

      if (onPaid) onPaid();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-brand" />
            <h2 className="font-bold text-stone-800">Registrar pago a proveedor</h2>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1 hover:bg-stone-100 rounded disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Restock summary */}
          <div className="bg-stone-50 rounded-xl p-3">
            <div className="text-xs text-stone-500 uppercase tracking-wider font-medium">
              {isMulti ? `${restockArr.length} facturas` : "Factura"}
            </div>
            <div className="font-bold text-stone-800 mt-0.5">{supplierName}</div>
            {isMulti ? (
              <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-stone-400 font-bold px-1">
                  <span className="flex-1">Factura</span>
                  <span className="w-16 text-right">Pendiente</span>
                  <span className="w-20 text-right">Pagar $</span>
                </div>
                {restockArr.map((r) => {
                  const out = Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0));
                  const currentAmt = parseFloat(perInvoiceAmounts[r.id]) || 0;
                  const overRow = currentAmt > out + 0.005;
                  const delta = overRow ? currentAmt - out : 0;
                  return (
                    <div key={r.id} className={`text-xs rounded px-1.5 py-1 border ${overRow ? "border-amber-300 bg-amber-50" : "border-stone-100 bg-white"}`}>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-stone-700 truncate">{r.restock_date}</p>
                          {r.notes && <p className="text-[10px] text-stone-400 truncate">{r.notes}</p>}
                        </div>
                        <span className="w-16 text-right text-stone-500 text-[11px]">${out.toFixed(2)}</span>
                        <div className="w-20 flex items-center gap-0.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={perInvoiceAmounts[r.id] ?? ""}
                            onChange={(e) => setPerInvoiceAmounts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="w-full border rounded px-1 py-0.5 text-xs text-right focus:outline-none focus:border-brand border-stone-300"
                          />
                          <button
                            type="button"
                            onClick={() => setPerInvoiceAmounts((prev) => ({ ...prev, [r.id]: out.toFixed(2) }))}
                            className="text-[9px] text-stone-400 hover:text-brand px-0.5"
                            title="Pagar todo lo pendiente de esta factura"
                          >max</button>
                        </div>
                      </div>
                      {overRow && (
                        <p className="text-[10px] text-amber-700 mt-0.5 flex items-center gap-1">
                          <TrendingUp size={10} /> Subió ${delta.toFixed(2)} del estimado
                        </p>
                      )}
                    </div>
                  );
                })}
                {multiOverpayRows.length > 0 && (
                  <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded p-2 text-[11px]">
                    <p className="text-amber-800 font-medium flex items-center gap-1">
                      <TrendingUp size={11} /> {multiOverpayRows.length} factura{multiOverpayRows.length !== 1 ? "s" : ""} con precio subido
                    </p>
                    <label className="flex items-center gap-1.5 mt-1 cursor-pointer text-amber-700">
                      <input
                        type="checkbox"
                        checked={updatePrices}
                        onChange={(e) => setUpdatePrices(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <span>Actualizar costo de productos en esas facturas (MAC futuro)</span>
                    </label>
                    {updatePrices && (
                      <p className="text-[10px] text-amber-600 mt-1 ml-4">
                        Ventas históricas mantienen su costo grabado. Cambio queda en historial.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              firstRestock.notes && <div className="text-xs text-stone-500 mt-0.5">{firstRestock.notes}</div>
            )}
            <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
              <div>
                <div className="text-[11px] text-stone-500">Total</div>
                <div className="font-bold text-stone-800">${total.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[11px] text-stone-500">Pagado</div>
                <div className="font-bold text-violet-700">${alreadyPaid.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[11px] text-stone-500">Pendiente</div>
                <div className="font-bold text-amber-700">${outstanding.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Amount: en single un input; en multi se muestra el total agregado solamente */}
          <div>
            {isMulti ? (
              <div className="bg-stone-50 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-stone-500">Total a pagar (suma de las {restockArr.length} facturas):</span>
                <span className="text-base font-bold text-brand">${amountNum.toFixed(2)}</span>
              </div>
            ) : (
              <>
                <label className="text-xs text-stone-500 mb-1 block">Monto a pagar ($REF)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                  <button
                    onClick={() => setAmount(String(outstanding.toFixed(2)))}
                    className="px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs"
                    title="Pagar todo lo pendiente"
                  >
                    Todo
                  </button>
                </div>
              </>
            )}
            {isOverpay && (
              <div className="text-xs text-amber-700 mt-1 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded p-2">
                <TrendingUp size={13} className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">El proveedor cobró ${overpayDelta.toFixed(2)} más de lo estimado.</p>
                  <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updatePrices}
                      onChange={(e) => setUpdatePrices(e.target.checked)}
                      className="w-3.5 h-3.5"
                    />
                    <span>Actualizar costo de productos (impacta MAC futuro)</span>
                  </label>
                  {updatePrices && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      Los costos de venta históricos NO se modifican. Cambio queda en historial.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Método de pago</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-2 py-2 text-sm focus:border-brand focus:outline-none"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            {(() => {
              const m = PAYMENT_METHODS.find((x) => x.id === method);
              if (!m?.needsRef && !m?.acceptsRef) return null;
              return (
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">
                    Referencia {!m.needsRef && <span className="text-stone-400">(opcional)</span>}
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={m.refHint || "Nº ref"}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
              );
            })()}
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Fecha del pago</label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            {usesRate && (
              <div>
                <label className="text-xs text-stone-500 mb-1 block">
                  Tasa Bs/USD del día
                  <span className="text-[10px] text-stone-400 ml-1">(editable)</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Bs preview */}
          {amountBs != null && (
            <div className="text-sm text-stone-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              Pago: <strong>${amountNum.toFixed(2)}</strong> = <strong>Bs {amountBs.toLocaleString("es-VE", { maximumFractionDigits: 2 })}</strong> a tasa {rateNum.toFixed(4)}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Notas (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cualquier detalle del pago"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          {/* Status preview */}
          <div className="text-xs text-stone-500 flex items-center gap-1">
            <CheckCircle2 size={12} />
            Después de este pago: <strong className={isFullPayment || isOverpay ? "text-green-700" : "text-violet-700"}>
              {isOverpay ? `Pagada (total ajustado a $${(alreadyPaid + amountNum).toFixed(2)})` : isFullPayment ? "Pagada completa" : "Parcial"}
            </strong>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded-lg text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-5 py-2 bg-brand text-white hover:bg-brand-dark rounded-lg text-sm font-bold disabled:opacity-40 flex items-center gap-1.5"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><DollarSign size={14} /> Confirmar pago</>}
          </button>
        </div>
      </div>
    </div>
  );
}
