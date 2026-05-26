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

export default function RestockPaymentModal({ restock, payments = [], rate, user, onClose, onPaid }) {
  const total = Number(restock.total_cost_ref || 0);
  const alreadyPaid = Number(restock.paid_amount_ref || 0);
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
  const isOverpay = amountNum > outstanding + 0.005;
  const overpayDelta = isOverpay ? amountNum - outstanding : 0;
  const newStatus = isFullPayment || isOverpay ? "paid" : amountNum > 0 ? "partial" : restock.payment_status;

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

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");

    try {
      // 1. Insert payment
      const { error: payErr } = await supabase.from("cantina_restock_payments").insert({
        restock_id: restock.id,
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

      // 2. Update restock — incluye total nuevo si hubo overpay (el proveedor cobró más)
      const newPaid = alreadyPaid + amountNum;
      const newTotal = isOverpay ? newPaid : Number(restock.total_cost_ref || 0);
      const restockUpdate = {
        paid_amount_ref: newPaid,
        payment_status: newStatus,
      };
      if (isOverpay) restockUpdate.total_cost_ref = newTotal;
      const { error: upErr } = await supabase
        .from("cantina_restocks")
        .update(restockUpdate)
        .eq("id", restock.id);
      if (upErr) throw upErr;

      // 2b. Si overpay + staff marcó "actualizar precios": ajustar cost_ref de los
      //     productos del restock proporcionalmente (forward-only, ventas pasadas
      //     mantienen el cost ya grabado). Registramos también una "alerta" como
      //     stock_movement con type='adjustment' y notes detalladas para audit.
      if (isOverpay && updatePrices) {
        const oldTotal = Number(restock.total_cost_ref || 0);
        const factor = oldTotal > 0 ? newTotal / oldTotal : 1;
        const restockItems = Array.isArray(restock.items) ? restock.items : [];
        for (const it of restockItems) {
          if (!it?.product_id || !it?.cost_per_unit_ref) continue;
          const oldCostU = Number(it.cost_per_unit_ref);
          const newCostU = oldCostU * factor;
          // Update producto cost_ref a el nuevo (MAC simplificado por ahora —
          // forward-only, no recalcula ventas pasadas).
          await supabase.from("products").update({ cost_ref: newCostU }).eq("id", it.product_id);
          // Audit trail: alerta persistente como stock_movement
          await supabase.from("stock_movements").insert({
            product_id: it.product_id,
            product_name: it.name || "(producto)",
            movement_type: "adjustment",
            quantity: 0,
            reference_id: restock.id,
            cost_ref: newCostU,
            notes: `⚠️ Precio actualizado por factura final: $${oldCostU.toFixed(4)} → $${newCostU.toFixed(4)} (proveedor ${restock.supplier || "?"})`,
            created_by: user?.name || "Cantina",
          });
        }
      }

      // 3. Crear expense (cash outflow real). Categoría derivada de los items
      //    del restock; misma lógica que RestockForm "ya pagada".
      try {
        const restockItems = Array.isArray(restock.items) ? restock.items : [];
        // Derivar category: si todos los items son del mismo product.category
        // usamos esa, si no "Insumos cantina · Otros". Para no traer products
        // de DB acá, usamos la category del primer item si está cacheada en
        // items[].category, o un default.
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
        const expenseCategory = categories.size === 1 ? [...categories][0] : "Insumos cantina · Otros";
        const { error: expErr } = await supabase.from("expenses").insert({
          id: "exp_" + Math.random().toString(36).slice(2, 12),
          expense_type: "variable",
          category: expenseCategory,
          name: `Pago factura ${restock.supplier || "proveedor"}${isFullPayment ? "" : " (parcial)"}`,
          amount_usd: amountNum,
          amount_bs: amountBs,
          exchange_rate: usesRate && rateNum > 0 ? rateNum : null,
          payment_method: method,
          reference: reference.trim() || null,
          provider: restock.supplier || null,
          expense_date: paidAt,
          created_by: user?.name || "Cantina",
          notes: `Pago contra restock ${restock.id}${notes ? ` · ${notes}` : ""}`,
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
            <div className="text-xs text-stone-500 uppercase tracking-wider font-medium">Factura</div>
            <div className="font-bold text-stone-800 mt-0.5">{restock.supplier || "Sin proveedor"}</div>
            <div className="text-xs text-stone-500 mt-0.5">{restock.notes || ""}</div>
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
