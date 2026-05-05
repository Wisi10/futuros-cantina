"use client";
import { useState, Fragment } from "react";
import { Plus, Trash2, Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductImage, generateId } from "@/lib/utils";

const PRODUCT_CATEGORIES = ["Bebida", "Comida", "Snack", "Otro"];

function emptyRow() {
  return { productId: "", qty: "", costRef: "", costUsd: "" };
}

function emptyNewProduct() {
  return { name: "", category: "Otro", priceRef: "", emoji: "" };
}

export default function RestockForm({ products, user, onRestocked, onProductCreated }) {
  const [rows, setRows] = useState([emptyRow()]);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingForRow, setCreatingForRow] = useState(null);
  const [newProduct, setNewProduct] = useState(emptyNewProduct());
  const [creating, setCreating] = useState(false);

  const updateRow = (i, field, value) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (i) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const startCreating = (rowIndex) => {
    setCreatingForRow(rowIndex);
    setNewProduct(emptyNewProduct());
  };

  const cancelCreating = () => {
    setCreatingForRow(null);
    setNewProduct(emptyNewProduct());
  };

  const handleCreateProduct = async (rowIndex) => {
    const name = newProduct.name.trim();
    const priceRef = Number(newProduct.priceRef);
    if (!name || !priceRef || priceRef <= 0) return;
    setCreating(true);
    try {
      // Duplicate check (case-insensitive exact match)
      const { data: existing } = await supabase
        .from("products")
        .select("id, name")
        .ilike("name", name)
        .limit(1);
      if (existing && existing.length > 0) {
        alert(`Ya existe un producto con nombre "${existing[0].name}". Usa el existente o cambia el nombre.`);
        setCreating(false);
        return;
      }
      // Next sort_order
      const { data: maxRow } = await supabase
        .from("products")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = Number(maxRow?.[0]?.sort_order || 0) + 1;
      // Insert
      const newId = generateId();
      const { error } = await supabase.from("products").insert({
        id: newId,
        name,
        category: newProduct.category || "Otro",
        price_ref: priceRef,
        cost_ref: 0,
        emoji: newProduct.emoji.trim() || null,
        is_cantina: true,
        active: true,
        sort_order: nextOrder,
        stock_quantity: 0,
      });
      if (error) throw error;
      // Reload parent products list, then auto-select via callback
      if (onProductCreated) {
        await onProductCreated(newId);
      }
      // Auto-select in current row
      updateRow(rowIndex, "productId", newId);
      setCreatingForRow(null);
      setNewProduct(emptyNewProduct());
    } catch (err) {
      alert("Error creando producto: " + err.message);
    }
    setCreating(false);
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
          supplier: supplier || null,
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium min-w-[200px]">Producto</th>
                <th className="text-center px-3 py-2 font-medium w-20">Qty</th>
                <th className="text-center px-3 py-2 font-medium w-28">Costo/u REF</th>
                <th className="text-center px-3 py-2 font-medium w-28">Costo/u USD</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <Fragment key={i}>
                <tr className="border-t border-stone-100">
                  <td className="px-3 py-2">
                    <select
                      value={row.productId}
                      onChange={(e) => {
                        if (e.target.value === "__create__") {
                          startCreating(i);
                        } else {
                          updateRow(i, "productId", e.target.value);
                        }
                      }}
                      className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                    >
                      <option value="">Seleccionar...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.emoji || "🍽️"} {p.name} (stock: {Number(p.stock_quantity || 0)})
                        </option>
                      ))}
                      <option value="__create__">+ Crear producto nuevo</option>
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
                    <button
                      onClick={() => removeRow(i)}
                      disabled={rows.length <= 1}
                      className="p-1 text-stone-300 hover:text-red-500 disabled:opacity-30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
                {creatingForRow === i && (
                  <tr className="border-t border-stone-100 bg-brand-cream-light/40">
                    <td colSpan={5} className="px-3 py-3">
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-brand font-bold">Crear producto nuevo</p>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <input
                            type="text"
                            value={newProduct.name}
                            onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Nombre del producto"
                            maxLength={60}
                            className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                            autoFocus
                          />
                          <select
                            value={newProduct.category}
                            onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))}
                            className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none bg-white"
                          >
                            {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={newProduct.priceRef}
                            onChange={(e) => setNewProduct((p) => ({ ...p, priceRef: e.target.value }))}
                            placeholder="Precio venta REF"
                            className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                          />
                          <input
                            type="text"
                            value={newProduct.emoji}
                            onChange={(e) => setNewProduct((p) => ({ ...p, emoji: e.target.value }))}
                            placeholder="🍺 (emoji opcional)"
                            maxLength={4}
                            className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={cancelCreating}
                            disabled={creating}
                            className="px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-100 rounded-lg flex items-center gap-1 disabled:opacity-50"
                          >
                            <X size={12} /> Cancelar
                          </button>
                          <button
                            onClick={() => handleCreateProduct(i)}
                            disabled={creating || !newProduct.name.trim() || !Number(newProduct.priceRef)}
                            className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-brand-dark flex items-center gap-1"
                          >
                            {creating ? <><Loader2 size={12} className="animate-spin" /> Creando...</> : "Crear y seleccionar"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
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
