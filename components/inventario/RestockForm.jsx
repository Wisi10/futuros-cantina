"use client";
import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Loader2, Sparkles, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import InvoiceUploadModal from "./InvoiceUploadModal";

// Combobox con búsqueda para elegir un producto entre N (>100). Reemplaza
// el <select> nativo (scroll inviable con 153 productos). Filtra por nombre
// case/accent-insensitive. Click fuera cierra.
function ProductPicker({ products, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = products.find((p) => p.id === value);
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const qNorm = norm(q.trim());
  const filtered = qNorm
    ? products.filter((p) => norm(p.name).includes(qNorm)).slice(0, 30)
    : products.slice(0, 30);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQ(""); }}
        className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-left bg-white hover:border-brand transition-colors flex items-center justify-between gap-2"
      >
        <span className={selected ? "text-stone-800 truncate" : "text-stone-400"}>
          {selected ? `${selected.emoji || "🍽️"} ${selected.name}` : "Seleccionar..."}
        </span>
        <Search size={12} className="text-stone-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-1.5 border-b border-stone-100 relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              autoFocus
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full border border-stone-200 rounded pl-6 pr-7 py-1 text-xs focus:outline-none focus:border-brand"
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                <X size={11} />
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 scrollbar-hide">
            {filtered.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-3">Sin resultados</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange(p.id); setOpen(false); setQ(""); }}
                  className={`w-full text-left px-2 py-1.5 hover:bg-stone-50 text-xs flex items-center justify-between gap-2 ${
                    p.id === value ? "bg-brand/5 text-brand font-medium" : "text-stone-700"
                  }`}
                >
                  <span className="truncate">
                    {p.emoji || "🍽️"} {p.name}
                  </span>
                  <span className="text-[10px] text-stone-400 shrink-0">stk {Number(p.stock_quantity || 0)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Reglas:
// - Productos con receta (has_recipe=true) NO se stockean directo: se controlan
//   ingredientes en Materia Prima y el sistema deriva cuántas porciones hay.
//   Se filtran del dropdown.
// - Cantidad: usuario puede llenar qty O peso/volumen total. Si llena
//   peso/vol y el producto tiene unit_size (o se setea inline), qty = total/size.
// - Costo: usuario entra COSTO TOTAL del lote; sistema calcula costo/u = total/qty.
// - Proveedor: dropdown con proveedores históricos + opción "Nuevo".
// - unit_size/unit_label: si el producto no tiene, se puede setear ad-hoc en
//   la fila y se persiste al producto al confirmar la entrada.
function emptyRow() {
  return {
    productId: "", qty: "", amount: "", costTotal: "",
    inlineSize: "", inlineLabel: "",
  };
}

// Mapping de category del producto → category del gasto auto-creado.
// Si todos los items de un restock son de la misma category, usamos esa.
// Si son mixtos (o ninguno encaja), default a "Insumos cantina · Otros".
function deriveExpenseCategory(items, productLookup) {
  const cats = new Set();
  for (const it of items) {
    const p = productLookup(it.product_id);
    const pc = p?.category;
    if (!pc) { cats.add("Insumos cantina · Otros"); continue; }
    if (pc === "Bebida") cats.add("Insumos cantina · Bebida");
    else if (pc === "Comida") cats.add("Insumos cantina · Comida");
    else if (pc === "Snacks") cats.add("Insumos cantina · Snacks");
    else if (pc === "Helados") cats.add("Insumos cantina · Helados");
    else if (pc === "Insumos") cats.add("Insumos cantina · Empaques");
    else cats.add("Insumos cantina · Otros");
  }
  return cats.size === 1 ? [...cats][0] : "Insumos cantina · Otros";
}

const PAYMENT_METHODS = [
  { id: "pago_movil", label: "Pago Móvil", acceptsRef: true, refHint: "Últimos 4 dígitos" },
  { id: "zelle", label: "Zelle", needsRef: true, acceptsRef: true, refHint: "Email o ref" },
  { id: "cash_usd", label: "Cash USD" },
  { id: "cash_bs", label: "Cash Bs" },
  { id: "transferencia", label: "Transferencia", acceptsRef: true, refHint: "Nº transferencia" },
];

export default function RestockForm({ products, user, onRestocked }) {
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [rows, setRows] = useState([emptyRow()]);
  const [supplier, setSupplier] = useState("");
  const [newSupplierMode, setNewSupplierMode] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pago_movil");
  const [paymentRef, setPaymentRef] = useState("");
  // Si la entrada YA fue pagada en el momento (mi fix anterior) o queda en
  // cuentas por pagar para liquidar después. Default 'paid' por compatibilidad
  // con el flujo previo, pero el toggle UI hace que el staff lo elija conscientemente.
  const [paymentStatus, setPaymentStatus] = useState("paid"); // 'paid' | 'pending'
  const [dueDate, setDueDate] = useState(() => {
    // Default 30 días desde hoy
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [saving, setSaving] = useState(false);

  // Filtrar productos con receta — esos se manejan vía ingredientes en materia prima.
  const selectableProducts = products.filter((p) => !p.has_recipe);

  const productById = (id) => products.find((p) => p.id === id);

  // Cargar proveedores históricos
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cantina_restocks")
        .select("supplier")
        .not("supplier", "is", null)
        .order("restock_date", { ascending: false })
        .limit(500);
      const distinct = Array.from(new Set((data || []).map(r => (r.supplier || "").trim()).filter(Boolean)));
      setSupplierOptions(distinct.sort());
    })();
  }, []);

  // unit_size efectivo: del producto, o el inline si el producto no tiene.
  function effectiveUnitSize(row) {
    const product = productById(row.productId);
    if (product?.unit_size > 0) return Number(product.unit_size);
    const inline = parseFloat(row.inlineSize);
    if (Number.isFinite(inline) && inline > 0) return inline;
    return null;
  }
  function effectiveUnitLabel(row) {
    const product = productById(row.productId);
    if (product?.unit_label) return product.unit_label;
    if (row.inlineLabel?.trim()) return row.inlineLabel.trim();
    return null;
  }
  // qty efectivo: si hay amount + unit_size efectivo → calcular. Si no, qty directo.
  function effectiveQty(row) {
    const amountNum = parseFloat(row.amount);
    const us = effectiveUnitSize(row);
    if (Number.isFinite(amountNum) && amountNum > 0 && us) {
      return amountNum / us;
    }
    return parseFloat(row.qty) || 0;
  }
  function costPerUnit(row) {
    const total = parseFloat(row.costTotal) || 0;
    const qty = effectiveQty(row);
    if (qty <= 0) return 0;
    return total / qty;
  }

  const updateRow = (i, field, value) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (i) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const validRows = rows.filter((r) => r.productId && effectiveQty(r) > 0);

  const totalCostRef = validRows.reduce((sum, r) => sum + (parseFloat(r.costTotal) || 0), 0);

  const handleSubmit = async () => {
    if (validRows.length === 0) return;
    if (!supplier.trim()) {
      alert("Debes elegir o crear un proveedor antes de registrar la entrada.");
      return;
    }
    setSaving(true);

    try {
      const items = validRows.map((r) => {
        const product = productById(r.productId);
        const qty = effectiveQty(r);
        return {
          product_id: r.productId,
          name: product?.name || "?",
          qty,
          cost_per_unit_ref: costPerUnit(r),
          total_cost_ref: parseFloat(r.costTotal) || 0,
        };
      });

      // 1. Insert cantina_restocks con estado de pago
      const isPaidNow = paymentStatus === "paid";
      const { data: restock, error: restockErr } = await supabase
        .from("cantina_restocks")
        .insert({
          restock_date: date,
          items,
          total_cost_ref: totalCostRef,
          supplier: supplier.trim(),
          notes: notes || null,
          created_by: user?.name || "Cantina",
          payment_status: isPaidNow ? "paid" : "pending",
          paid_amount_ref: isPaidNow ? totalCostRef : 0,
          due_date: isPaidNow ? null : dueDate,
        })
        .select()
        .single();
      if (restockErr) throw restockErr;

      // 2. Por cada fila: stock_movement + update product (stock + unit_size si aplica)
      for (let idx = 0; idx < validRows.length; idx++) {
        const r = validRows[idx];
        const item = items[idx];
        const product = productById(item.product_id);

        const { error: movErr } = await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          product_name: item.name,
          movement_type: "restock",
          quantity: item.qty,
          reference_id: restock.id,
          cost_ref: item.cost_per_unit_ref,
          notes: `Restock${notes ? ` — ${notes}` : ""}`,
          created_by: user?.name || "Cantina",
        });
        if (movErr) throw movErr;

        const newStock = Number(product?.stock_quantity || 0) + item.qty;
        // Persistir unit_size/unit_label si se setearon inline y el producto no tenía.
        const updatePayload = { stock_quantity: newStock };
        if (!product?.unit_size && parseFloat(r.inlineSize) > 0) {
          updatePayload.unit_size = parseFloat(r.inlineSize);
        }
        if (!product?.unit_label && r.inlineLabel?.trim()) {
          updatePayload.unit_label = r.inlineLabel.trim();
        }
        // cost_ref es manejado por trigger recompute_product_mac (migration 017).
        const { error: stockErr } = await supabase
          .from("products")
          .update(updatePayload)
          .eq("id", item.product_id);
        if (stockErr) throw stockErr;
      }

      // 3. Si la entrada se marca como YA PAGADA → crear expense automático.
      //    Si queda "por pagar" → no crea gasto todavía; aparecerá en Por Pagar
      //    y el expense se crea cuando se registre el pago.
      let expenseOk = true;
      let expenseErrMsg = null;
      if (isPaidNow) {
        try {
          const expenseCategory = deriveExpenseCategory(items, productById);
          const { error: expErr } = await supabase.from("expenses").insert({
            id: "exp_" + Math.random().toString(36).slice(2, 12),
            expense_type: "variable",
            category: expenseCategory,
            name: `Compra ${supplier.trim()}`,
            amount_usd: totalCostRef,
            payment_method: paymentMethod,
            reference: paymentRef.trim() || null,
            provider: supplier.trim(),
            expense_date: date,
            created_by: user?.name || "Cantina",
            notes: `Auto-creado desde restock ${restock.id}${notes ? ` · ${notes}` : ""}`,
          });
          if (expErr) { expenseOk = false; expenseErrMsg = expErr.message; }
        } catch (linkErr) {
          expenseOk = false;
          expenseErrMsg = linkErr.message;
        }
        if (!expenseOk) console.error("[RESTOCK→GASTO]", expenseErrMsg);
      }

      // Agregar supplier al dropdown si era nuevo (evita tener que refrescar la página)
      if (supplier.trim() && !supplierOptions.includes(supplier.trim())) {
        setSupplierOptions((prev) => [...prev, supplier.trim()].sort());
      }
      // Reset form
      setRows([emptyRow()]);
      setSupplier("");
      setNewSupplierMode(false);
      setNotes("");
      setPaymentMethod("pago_movil");
      setPaymentRef("");
      setPaymentStatus("paid");
      if (isPaidNow) {
        if (expenseOk) {
          alert("Entrada registrada ✅ Inventario + gasto creados.");
        } else {
          alert(`Inventario actualizado ✅, pero el gasto NO se creó. Ingrésalo manual desde Gastos.\n\nError: ${expenseErrMsg}`);
        }
      } else {
        alert("Entrada registrada ✅ Stock actualizado. La factura quedó en 'Por Pagar' (vence " + dueDate + "). Cuando la pagues, se registra el gasto automático.");
      }
      onRestocked();
    } catch (err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-stone-700">Formulario de entrada</h3>
            <p className="text-[11px] text-stone-400 mt-0.5">
              Productos con receta no se ingresan acá — solo sus ingredientes (Materia Prima). Costo total del lote; el sistema divide.
            </p>
          </div>
          <button
            onClick={() => setInvoiceModalOpen(true)}
            className="shrink-0 px-3 py-1.5 bg-gradient-to-r from-brand to-brand-dark text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
            title="Subir foto de factura y dejar que Claude Vision extraiga los datos"
          >
            <Sparkles size={13} /> Subir factura
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium min-w-[200px]">Producto</th>
                <th className="text-center px-3 py-2 font-medium w-24">Qty</th>
                <th className="text-center px-3 py-2 font-medium w-32">Peso / Vol total</th>
                <th className="text-center px-3 py-2 font-medium w-28">Costo total $</th>
                <th className="text-center px-3 py-2 font-medium w-24">Costo/u $</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const product = productById(row.productId);
                const productHasUnit = product?.unit_size > 0 && product?.unit_label;
                const eff = effectiveQty(row);
                const cpu = costPerUnit(row);
                const amountFilled = parseFloat(row.amount) > 0 && effectiveUnitSize(row) > 0;
                return (
                  <tr key={i} className="border-t border-stone-100 align-top">
                    <td className="px-3 py-2">
                      <ProductPicker
                        products={selectableProducts}
                        value={row.productId}
                        onChange={(id) => updateRow(i, "productId", id)}
                      />
                      {/* Inline set de tamaño si el producto no lo tiene */}
                      {product && !productHasUnit && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-stone-500">
                          <span className="shrink-0">Tamaño:</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={row.inlineSize}
                            onChange={(e) => updateRow(i, "inlineSize", e.target.value)}
                            placeholder="1"
                            className="w-14 border border-stone-300 rounded px-1.5 py-1 text-[11px] text-right"
                          />
                          <input
                            type="text"
                            value={row.inlineLabel}
                            onChange={(e) => updateRow(i, "inlineLabel", e.target.value)}
                            placeholder="kg / u"
                            maxLength={8}
                            className="w-14 border border-stone-300 rounded px-1.5 py-1 text-[11px]"
                          />
                          <span className="text-stone-400">(se guarda en el producto)</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amountFilled ? eff.toFixed(2) : row.qty}
                        onChange={(e) => updateRow(i, "qty", e.target.value)}
                        disabled={amountFilled}
                        className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-center focus:border-brand focus:outline-none disabled:bg-stone-50 disabled:text-stone-500"
                        placeholder="0"
                        title={amountFilled ? "Calculado del peso/volumen" : ""}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {effectiveUnitSize(row) ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.amount}
                            onChange={(e) => updateRow(i, "amount", e.target.value)}
                            className="flex-1 border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-center focus:border-brand focus:outline-none"
                            placeholder="0"
                          />
                          <span className="text-[11px] text-stone-500 font-medium">{effectiveUnitLabel(row)}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-stone-300 italic">define tamaño</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={row.costTotal}
                        onChange={(e) => updateRow(i, "costTotal", e.target.value)}
                        className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-center focus:border-brand focus:outline-none"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-2 text-center text-stone-500 text-xs">
                      {eff > 0 && cpu > 0 ? `$${cpu.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeRow(i)}
                        disabled={rows.length <= 1}
                        className="p-1 text-stone-300 hover:text-red-500 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-stone-100">
          <button onClick={addRow} className="text-xs text-brand hover:underline flex items-center gap-1">
            <Plus size={12} /> Agregar fila
          </button>
        </div>
      </div>

      {/* Proveedor, Fecha, Método pago y Notas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <label className="text-xs font-medium text-stone-500 block mb-1">Proveedor</label>
          {newSupplierMode || supplierOptions.length === 0 ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                autoFocus={newSupplierMode}
              />
              {supplierOptions.length > 0 && (
                <button onClick={() => { setNewSupplierMode(false); setSupplier(""); }}
                  className="text-[11px] text-brand hover:underline">
                  ← Elegir existente
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <select
                value={supplier}
                onChange={(e) => {
                  if (e.target.value === "__new__") { setNewSupplierMode(true); setSupplier(""); return; }
                  setSupplier(e.target.value);
                }}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
              >
                <option value="">Seleccionar proveedor...</option>
                {supplierOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="__new__">+ Nuevo proveedor...</option>
              </select>
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <label className="text-xs font-medium text-stone-500 block mb-1">Fecha de entrada</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <label className="text-xs font-medium text-stone-500 block mb-1">¿Estado del pago?</label>
          <div className="flex gap-1.5 mb-2">
            <button
              type="button"
              onClick={() => setPaymentStatus("paid")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                paymentStatus === "paid"
                  ? "bg-brand text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              Ya pagada
            </button>
            <button
              type="button"
              onClick={() => setPaymentStatus("pending")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                paymentStatus === "pending"
                  ? "bg-amber-500 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              Por pagar
            </button>
          </div>
          {paymentStatus === "paid" ? (
            <>
              <select
                value={paymentMethod}
                onChange={(e) => { setPaymentMethod(e.target.value); setPaymentRef(""); }}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
              >
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              {(() => {
                const m = PAYMENT_METHODS.find((x) => x.id === paymentMethod);
                if (!m?.needsRef && !m?.acceptsRef) return null;
                return (
                  <input
                    type="text"
                    maxLength={20}
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder={m.refHint || "Referencia"}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none mt-2"
                  />
                );
              })()}
            </>
          ) : (
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          )}
          <p className="text-[10px] text-stone-400 mt-1">
            {paymentStatus === "paid"
              ? "Se registra como gasto inmediato."
              : "Vence en esta fecha. Queda en 'Por Pagar' hasta liquidar."}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <label className="text-xs font-medium text-stone-500 block mb-1">Notas (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas generales"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {/* Totals & Submit */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 flex items-center justify-between">
        <div className="text-sm text-stone-500">
          {validRows.length} producto{validRows.length !== 1 ? "s" : ""} ·
          Total: <span className="font-bold text-brand">${totalCostRef.toFixed(2)}</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving || validRows.length === 0}
          className="px-6 py-2.5 bg-brand text-white rounded-xl text-sm font-bold disabled:opacity-30 hover:bg-brand-dark transition-all flex items-center gap-2"
        >
          {saving ? <><Loader2 size={16} className="animate-spin" /> Procesando...</> : "Confirmar entrada"}
        </button>
      </div>

      {invoiceModalOpen && (
        <InvoiceUploadModal
          products={products}
          user={user}
          onClose={() => setInvoiceModalOpen(false)}
          onConfirmed={() => {
            setInvoiceModalOpen(false);
            onRestocked();
          }}
        />
      )}
    </div>
  );
}
