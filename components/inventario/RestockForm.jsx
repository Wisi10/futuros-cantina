"use client";
import { useState } from "react";
import { Plus, Trash2, Loader2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";

function emptyRow() {
  return { productId: "", qty: "", costRef: "", costUsd: "", supplier: "" };
}

export default function RestockForm({ products, user, onRestocked }) {
  const [rows, setRows] = useState([emptyRow()]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const updateRow = (i, field, value) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (i) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const validRows = rows.filter((r) => r.productId && Number(r.qty) > 0);

  const totalCostRef = validRows.reduce(
    (sum, r) => sum + Number(r.qty || 0) * Number(r.costRef || 0), 0
  );
  const totalCostUsd = validRows.reduce(
    (sum, r) => sum + Number(r.qty || 0) * Number(r.costUsd || 0), 0
  );

  const handleSubmit = async () => {
    if (validRows.length === 0) return;
    setSaving(true);

    try {
      const items = validRows.map((r) => {
        const product = products.find((p) => p.id === r.productId);
        return {
          product_id: r.productId,
          name: product?.name || "?",
          qty: Number(r.qty),
          cost_per_unit_ref: Number(r.costRef || 0),
          cost_per_unit_usd: Number(r.costUsd || 0),
        };
      });

      // 1. Insert cantina_restocks
      const { data: restock, error: restockErr } = await supabase
        .from("cantina_restocks")
        .insert({
          restock_date: date,
          items,
          total_cost_ref: totalCostRef,
          total_cost_usd: totalCostUsd,
          supplier: validRows[0]?.supplier || null,
          notes: notes || null,
          created_by: user?.name || "Cantina",
        })
        .select()
        .single();
      if (restockErr) throw restockErr;

      // 2. Insert stock_movements + update products
      for (const item of items) {
        const product = products.find((p) => p.id === item.product_id);

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
        const { error: stockErr } = await supabase
          .from("products")
          .update({
            stock_quantity: newStock,
            cost_ref: item.cost_per_unit_ref > 0 ? item.cost_per_unit_ref : (product?.cost_ref || 0),
          })
          .eq("id", item.product_id);
        if (stockErr) throw stockErr;
      }

      // Reset form
      setRows([emptyRow()]);
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium min-w-[200px]">Producto</th>
                <th className="text-center px-3 py-2 font-medium w-20">Qty</th>
                <th className="text-center px-3 py-2 font-medium w-28">Costo/u REF</th>
                <th className="text-center px-3 py-2 font-medium w-28">Costo/u USD</th>
                <th className="text-left px-3 py-2 font-medium w-36">Proveedor</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
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
                      min="1"
                      value={row.qty}
                      onChange={(e) => updateRow(i, "qty", e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-center focus:border-brand focus:outline-none"
                      placeholder="0"
                    />
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
                    <input
                      type="number"
                      step="0.01"
                      value={row.costUsd}
                      onChange={(e) => updateRow(i, "costUsd", e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-center focus:border-brand focus:outline-none"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.supplier}
                      onChange={(e) => updateRow(i, "supplier", e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                      placeholder="Proveedor"
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
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-stone-100">
          <button onClick={addRow} className="text-xs text-brand hover:underline flex items-center gap-1">
            <Plus size={12} /> Agregar fila
          </button>
        </div>
      </div>

      {/* Date & Notes */}
      <div className="grid grid-cols-2 gap-4">
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
          Total: <span className="font-bold text-brand">REF {totalCostRef.toFixed(2)}</span>
          {totalCostUsd > 0 && <> · <span className="font-bold text-stone-700">USD {totalCostUsd.toFixed(2)}</span></>}
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
