"use client";
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { generateId } from "@/lib/utils";

export default function ClientFormModal({ client, user, onClose, onSaved }) {
  const isEdit = !!client;
  const [first, setFirst] = useState(client?.first_name || "");
  const [last, setLast] = useState(client?.last_name || "");
  const [phone, setPhone] = useState(client?.phone || "");
  const [cedula, setCedula] = useState(client?.cedula || "");
  const [notes, setNotes] = useState(client?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (saving) return;
    if (!first.trim() && !last.trim()) {
      setError("Nombre requerido");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("clients")
          .update({
            first_name: first.trim() || null,
            last_name: last.trim() || null,
            phone: phone.trim() || null,
            cedula: cedula.trim() || null,
            notes: notes.trim() || null,
          })
          .eq("id", client.id);
        if (error) throw error;
        await onSaved(client.id);
      } else {
        const id = "cli_" + generateId();
        const { error } = await supabase.from("clients").insert({
          id,
          first_name: first.trim() || null,
          last_name: last.trim() || null,
          phone: phone.trim() || null,
          cedula: cedula.trim() || null,
          notes: notes.trim() || null,
        });
        if (error) throw error;
        await onSaved(id);
      }
    } catch (e) {
      setError(e.message || "Error guardando");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-stone-200">
          <h2 className="text-base font-bold text-stone-800">{isEdit ? "Editar cliente" : "Nuevo cliente"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg" disabled={saving}>
            <X size={18} className="text-stone-400" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Nombre</label>
              <input
                type="text"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Apellido</label>
              <input
                type="text"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Telefono</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+58 412-555-7885"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Cedula</label>
            <input
              type="text"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
        </div>

        <div className="border-t border-stone-200 p-4 flex gap-2">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
