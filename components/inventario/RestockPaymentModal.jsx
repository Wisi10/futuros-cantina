"use client";
import { useState, useMemo, useEffect } from "react";
import { X, DollarSign, Loader2, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Modal para registrar pago contra un restock pendiente (lado proveedor).
// Mismo pattern canónico que cantina_credits/cantina_credit_payments del
// lado cliente: deuda en $REF locked + tabla pagos 1:N.

const PAYMENT_METHODS = [
  { id: "transferencia", label: "Transferencia" },
  { id: "pago_movil", label: "Pago Móvil" },
  { id: "zelle", label: "Zelle" },
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
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [exchangeRate, setExchangeRate] = useState(String(todaysRate || ""));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const amountNum = parseFloat(amount) || 0;
  const usesRate = method === "pago_movil" || method === "cash_bs" || method === "transferencia";
  const rateNum = parseFloat(exchangeRate) || 0;
  const amountBs = usesRate && rateNum > 0 ? amountNum * rateNum : null;

  const isFullPayment = amountNum >= outstanding - 0.005;
  // Overpay solo disponible en single-factura (en multi, distribución compleja).
  const isOverpay = !isMulti && amountNum > outstanding + 0.005;
  const overpayDelta = isOverpay ? amountNum - outstanding : 0;
  const newStatus = isFullPayment || isOverpay ? "paid" : amountNum > 0 ? "partial" : (firstRestock.payment_status || "pending");

  // Si proveedor cobró más de lo estimado, el staff confirma si actualizar
  // los precios de los productos del restock (forward-only). Default ON
  // cuando hay overpay, OFF cuando es pago normal.
  const [updatePrices, setUpdatePrices] = useState(false);
  // Auto-marcar updatePrices cuando aparece overpay (UX hint, el staff puede destildear)
  // y limpiar cuando se vuelve a pagos normales.
  useEffect(() => {
    setUpdatePrices(isOverpay);
  }, [isOverpay]);

  // Ya no bloqueamos overpay — el escenario real "el proveedor subió el precio"
  // requiere permitirlo. Solo bloqueamos amounts inválidos.
  const canSubmit = amountNum > 0 && !saving;

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
        // ─── MULTI-FACTURA: distribuir el monto entre las facturas del proveedor
        // Si amount cubre el total → cada factura se paga completa (paid).
        // Si amount es parcial → distribuir proporcionalmente al outstanding de cada factura.
        const totalOutstanding = outstanding;
        const isFullCombined = amountNum >= totalOutstanding - 0.005;
        const paymentInserts = [];
        const restockUpdates = [];
        for (const r of restockArr) {
          const rOutstanding = Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0));
          if (rOutstanding <= 0) continue;
          // Si pago completo combinado: cada factura recibe su outstanding exacto.
          // Si parcial: prorrateado.
          const allocated = isFullCombined
            ? rOutstanding
            : Math.round(amountNum * (rOutstanding / totalOutstanding) * 100) / 100;
          if (allocated <= 0) continue;
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
          const newPaidForR = Number(r.paid_amount_ref || 0) + allocated;
          const total = Number(r.total_cost_ref || 0);
          const status = newPaidForR >= total - 0.005 ? "paid" : "partial";
          restockUpdates.push({ id: r.id, paid_amount_ref: newPaidForR, payment_status: status });
        }

        if (paymentInserts.length === 0) throw new Error("Sin facturas con saldo pendiente");

        const { error: payErr } = await supabase.from("cantina_restock_payments").insert(paymentInserts);
        if (payErr) throw payErr;

        for (const u of restockUpdates) {
          const { error: upErr } = await supabase
            .from("cantina_restocks")
            .update({ paid_amount_ref: u.paid_amount_ref, payment_status: u.payment_status })
            .eq("id", u.id);
          if (upErr) throw upErr;
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
              <div className="mt-2 space-y-0.5 max-h-32 overflow-y-auto text-[11px]">
                {restockArr.map((r) => {
                  const out = Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0));
                  return (
                    <div key={r.id} className="flex justify-between text-stone-600">
                      <span>{r.restock_date} {r.notes ? `· ${r.notes}` : ""}</span>
                      <span className="font-medium">${out.toFixed(2)}</span>
                    </div>
                  );
                })}
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

          {/* Amount */}
          <div>
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
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Referencia (opcional)</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Nº ref"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
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
