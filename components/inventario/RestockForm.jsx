"use client";
import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Para materia prima con unit_size definido, el usuario puede entrar:
//   - qty directo (unidades), o
//   - amount (peso/volumen total) y el sistema calcula qty = amount / unit_size.
// Solo uno de los dos. amount tiene prioridad si está definido.
function emptyRow() {
  return { productId: "", qty: "", amount: "", costRef: "" };
}

export default function RestockForm({ products, user, onRestocked }) {
  const [rows, setRows] = useState([emptyRow()]);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const productById = (id) => products.find((p) => p.id === id);

  // qty efectivo: si el usuario llenó amount y el producto tiene unit_size,
  // calcular qty desde amount. Si no, usar qty directo.
  function effectiveQty(row) {
    const product = productById(row.productId);
    const amountNum = parseFloat(row.amount);
    if (Number.isFinite(amountNum) && amountNum > 0 && product?.unit_size > 0) {
      return amountNum / Number(product.unit_size);
    }
    return parseFloat(row.qty) || 0;
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

  const totalCostRef = validRows.reduce(
    (sum, r) => sum + effectiveQty(r) * Number(r.costRef || 0), 0
  );

  const handleSubmit = async () => {
    if (validRows.length === 0) return;
    setSaving(true);

    try {
      const items = validRows.map((r) => {
        const product = productById(r.productId);
        const qty = effectiveQty(r);
        return {
          product_id: r.productId,
          name: product?.name || "?",
          qty,
          cost_per_unit_ref: Number(r.costRef || 0),
        };
      });

      // 1. Insert cantina_restocks
      const { data: restock, error: restockErr } = await supabase
        .from("cantina_restocks")
        .insert({
          restock_date: date,
          items,
          total_cost_ref: totalCostRef,
          supplier: supplier || null,
          notes: notes || null,
          created_by: user?.name || "Cantina",
        })
        .select()
        .single();
      if (restockErr) throw restockErr;

      // 2. Insert stock_movements + update products
      for (const item of items) {
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
        // cost_ref es manejado por trigger recompute_product_mac (migration 017).
        const { error: stockErr } = await supabase
          .from("products")
          .update({ stock_quantity: newStock })
          .eq("id", item.product_id);
        if (stockErr) throw stockErr;
      }

      // Reset form
      setRows([emptyRow()]);
      setSupplier("");
      setNotes("");
      alert("Entrada registrada correctamente");
      onRestocked();
    } catch (err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100">
          <h3 className="font-bold text-sm text-stone-700">Formulario de entrada</h3>
          <p className="text-[11px] text-stone-400 mt-0.5">
            Para materia prima con tamaño definido (ej. 1 kg), podés llenar el peso/volumen total y el sistema calcula las unidades.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium min-w-[180px]">Producto</th>
                <th className="text-center px-3 py-2 font-medium w-24">Qty</th>
                <th className="text-center px-3 py-2 font-medium w-28">Peso / Vol total</th>
                <th className="text-center px-3 py-2 font-medium w-28">Costo/u $</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const product = productById(row.productId);
                const hasUnit = product?.unit_size > 0 && product?.unit_label;
                const eff = effectiveQty(row);
                const amountFilled = parseFloat(row.amount) > 0;
                return (
                  <tr key={i} className="border-t border-stone-100">
                    <td className="px-3 py-2">
                      <select
                        value={row.productId}
                        onChange={(e) => updateRow(i, "productId", e.target.value)}
                        className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                      >
                        <option value="">Seleccionar...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.emoji || "🍽️"} {p.name} (stock: {Number(p.stock_quantity || 0)})
                          </option>
                        ))}
                      </select>
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
                      {hasUnit ? (
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
                          <span className="text-[11px] text-stone-500 font-medium">{product.unit_label}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-stone-300 italic">N/A</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={row.costRef}
                        onChange={(e) => updateRow(i, "costRef", e.target.value)}
                        className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-center focus:border-brand focus:outline-none"
                        placeholder="0.00"
                      />
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

      {/* Supplier, Date & Notes */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <label className="text-xs font-medium text-stone-500 block mb-1">Proveedor</label>
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Nombre del proveedor"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
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
    </div>
  );
}
