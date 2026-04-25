"use client";
import { useState } from "react";
import { X, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";

const REASONS = [
  "Merma",
  "Perdida",
  "Robo",
  "Correccion de conteo",
  "Otro",
];

export default function StockAdjustModal({ product, user, onClose, onSaved }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const currentStock = Number(product.stock_quantity || 0);
  const qtyNum = parseInt(qty) || 0;
  const newStock = currentStock + qtyNum;

  const handleSave = async () => {
    if (!qtyNum || !reason) return;
    if (newStock < 0) { alert("El stock no puede quedar negativo"); return; }
    setSaving(true);

    try {
      // 1. Insert stock_movements
      const { error: movErr } = await supabase.from("stock_movements").insert({
        product_id: product.id,
        product_name: product.name,
        movement_type: "adjustment",
        quantity: qtyNum,
        notes: `${reason}${notes ? ` — ${notes}` : ""}`,
        created_by: user?.name || "Cantina",
      });
      if (movErr) throw movErr;

      // 2. Update product stock
      const { error: stockErr } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", product.id);
      if (stockErr) throw stockErr;

      onSaved();
    } catch (err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 className="font-bold text-sm">Ajuste manual — {product.emoji || "🍽️"} {product.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-200 rounded"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-stone-50 rounded-lg p-3 text-sm">
            Stock actual: <span className="font-bold">{currentStock}</span>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">
              Cantidad (positiva = entrada, negativa = salida)
            </label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Ej: -3 o +10"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            {qtyNum !== 0 && (
              <p className="text-xs text-stone-400 mt-1">
                Nuevo stock: <span className={`font-bold ${newStock < 0 ? "text-red-600" : "text-green-600"}`}>{newStock}</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Motivo *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            >
              <option value="">Seleccionar motivo...</option>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Notas (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalle adicional"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-stone-200 flex gap-2">
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded text-sm">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !qtyNum || !reason || newStock < 0}
            className="px-4 py-2 bg-brand text-white rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1"
          >
            {saving ? "..." : <><Save size={14} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
