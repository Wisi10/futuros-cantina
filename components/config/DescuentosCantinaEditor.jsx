"use client";
import { useEffect, useState, useCallback } from "react";
import { Percent, Plus, Edit2, Trash2, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function DescuentosCantinaEditor({ user }) {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPct, setNewPct] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPct, setEditPct] = useState("");
  const [savingId, setSavingId] = useState(null);

  const isAdmin = user?.cantinaRole === "admin";

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("discounts")
      .select("*")
      .eq("is_cantina", true)
      .order("sort_order", { ascending: true });
    setDiscounts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    const pct = Number(newPct);
    if (!name) { alert("Pon un nombre"); return; }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      alert("Porcentaje debe ser entre 0 y 100");
      return;
    }
    if (discounts.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      alert("Ya existe un descuento con ese nombre");
      return;
    }
    const nextOrder = discounts.length > 0 ? Math.max(...discounts.map((d) => d.sort_order || 0)) + 1 : 10;
    const { error } = await supabase.from("discounts").insert({
      name,
      percentage: pct,
      is_active: true,
      is_happy_hour: false,
      is_cantina: true,
      sort_order: nextOrder,
    });
    if (error) { alert("Error: " + error.message); return; }
    setNewName(""); setNewPct(""); setAdding(false);
    await load();
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditPct(String(d.percentage));
  };

  const saveEdit = async () => {
    const name = editName.trim();
    const pct = Number(editPct);
    if (!name) { alert("Pon un nombre"); return; }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      alert("Porcentaje debe ser entre 0 y 100");
      return;
    }
    setSavingId(editingId);
    const { error } = await supabase
      .from("discounts")
      .update({ name, percentage: pct, updated_at: new Date().toISOString() })
      .eq("id", editingId);
    setSavingId(null);
    if (error) { alert("Error: " + error.message); return; }
    setEditingId(null);
    await load();
  };

  const toggleActive = async (d) => {
    setSavingId(d.id);
    const { error } = await supabase
      .from("discounts")
      .update({ is_active: !d.is_active, updated_at: new Date().toISOString() })
      .eq("id", d.id);
    setSavingId(null);
    if (error) { alert("Error: " + error.message); return; }
    await load();
  };

  const handleDelete = async (d) => {
    if (!confirm(`Eliminar "${d.name}"? Esta accion es soft delete (queda inactivo, se preserva historico).`)) return;
    setSavingId(d.id);
    const { error } = await supabase
      .from("discounts")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", d.id);
    setSavingId(null);
    if (error) { alert("Error: " + error.message); return; }
    await load();
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm text-stone-700 flex items-center gap-2">
          <Percent size={14} /> Descuentos cantina
        </h2>
        {isAdmin && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-2 py-1 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark flex items-center gap-1"
          >
            <Plus size={12} /> Nuevo
          </button>
        )}
      </div>

      <p className="text-[11px] text-stone-400 mb-3">
        Descuentos que se podran asignar a clientes (el link cliente-descuento es manual por ahora).
      </p>

      {adding && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mb-3 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="text-[10px] text-stone-500 uppercase tracking-wider block mb-1">Nombre</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Empleado, VIP, etc"
              className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
              autoFocus
            />
          </div>
          <div className="w-24">
            <label className="text-[10px] text-stone-500 uppercase tracking-wider block mb-1">% Desc.</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={newPct}
              onChange={(e) => setNewPct(e.target.value)}
              placeholder="20"
              className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark flex items-center gap-1"
          >
            <Check size={12} /> Guardar
          </button>
          <button
            onClick={() => { setAdding(false); setNewName(""); setNewPct(""); }}
            className="px-3 py-1.5 bg-stone-200 text-stone-700 rounded-lg text-xs font-medium hover:bg-stone-300 flex items-center gap-1"
          >
            <X size={12} /> Cancelar
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-stone-400 animate-pulse py-4 text-center">Cargando...</p>
      ) : discounts.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-4">
          Sin descuentos configurados. {isAdmin && "Crea uno con el boton arriba."}
        </p>
      ) : (
        <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden">
          {discounts.map((d) => {
            const isEditing = editingId === d.id;
            const isSaving = savingId === d.id;
            return (
              <div
                key={d.id}
                className={`px-3 py-2 flex items-center gap-2 ${!d.is_active ? "bg-stone-50 opacity-60" : "bg-white"}`}
              >
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-stone-300 rounded-lg px-2 py-1 text-sm focus:border-brand focus:outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={editPct}
                      onChange={(e) => setEditPct(e.target.value)}
                      className="w-20 border border-stone-300 rounded-lg px-2 py-1 text-sm focus:border-brand focus:outline-none"
                    />
                    <button
                      onClick={saveEdit}
                      disabled={isSaving}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                      title="Guardar"
                    >
                      {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={isSaving}
                      className="p-1.5 text-stone-500 hover:bg-stone-100 rounded"
                      title="Cancelar"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-stone-800">{d.name}</span>
                    <span className="text-sm font-bold text-brand min-w-[60px] text-right">
                      {Number(d.percentage).toFixed(d.percentage % 1 === 0 ? 0 : 2)}%
                    </span>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => toggleActive(d)}
                          disabled={isSaving}
                          className={`w-9 h-5 rounded-full transition-colors shrink-0 ${
                            d.is_active ? "bg-green-500" : "bg-stone-300"
                          }`}
                          title={d.is_active ? "Activo" : "Inactivo"}
                        >
                          <div
                            className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              d.is_active ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        <button
                          onClick={() => startEdit(d)}
                          disabled={isSaving}
                          className="p-1.5 text-stone-500 hover:bg-stone-100 rounded"
                          title="Editar"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(d)}
                          disabled={isSaving}
                          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Eliminar (soft)"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
