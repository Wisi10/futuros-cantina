"use client";
import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Edit2, Trash2, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const POSITIONS = ["Cantina", "Caja", "Cocina", "Encargado", "Administrativo", "Limpieza", "Otro"];

export default function EmpleadosEditor({ user }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [form, setForm] = useState({ name: "", cedula: "", position: "Cantina", phone: "" });

  const isAdmin = user?.cantinaRole === "admin";

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("employees")
      .select("id, name, cedula, position, phone, is_active, start_date")
      .eq("is_cantina", true)
      .order("is_active", { ascending: false })
      .order("name");
    setEmployees(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({ name: "", cedula: "", position: "Cantina", phone: "" });

  const handleCreate = async () => {
    const name = form.name.trim();
    if (!name) { alert("Pon un nombre"); return; }
    setSavingId("new");
    const id = "emp_" + Math.random().toString(36).slice(2, 10);
    const { error } = await supabase.from("employees").insert({
      id, name, cedula: form.cedula.trim() || null,
      position: form.position || null, phone: form.phone.trim() || null,
      salary_usd: 0, is_active: true, is_cantina: true,
    });
    setSavingId(null);
    if (error) { alert("Error: " + error.message); return; }
    resetForm(); setCreating(false); await load();
  };

  const startEdit = (e) => {
    setEditingId(e.id);
    setForm({ name: e.name || "", cedula: e.cedula || "", position: e.position || "Cantina", phone: e.phone || "" });
  };

  const saveEdit = async () => {
    setSavingId(editingId);
    const { error } = await supabase.from("employees").update({
      name: form.name.trim(),
      cedula: form.cedula.trim() || null,
      position: form.position || null,
      phone: form.phone.trim() || null,
    }).eq("id", editingId);
    setSavingId(null);
    if (error) { alert("Error: " + error.message); return; }
    setEditingId(null); resetForm(); await load();
  };

  const toggleActive = async (e) => {
    setSavingId(e.id);
    const { error } = await supabase.from("employees").update({ is_active: !e.is_active }).eq("id", e.id);
    setSavingId(null);
    if (error) { alert("Error: " + error.message); return; }
    await load();
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm text-stone-700 flex items-center gap-2">
          <Users size={14} /> Empleados
        </h2>
        {isAdmin && !creating && (
          <button
            onClick={() => { resetForm(); setCreating(true); }}
            className="px-2 py-1 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark flex items-center gap-1"
          >
            <Plus size={12} /> Nuevo
          </button>
        )}
      </div>

      <p className="text-[11px] text-stone-400 mb-3">
        Listado del personal de cantina. Usado para asignar horarios en Turnos {">"} Horario.
      </p>

      {creating && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mb-3 grid grid-cols-2 gap-2">
          <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Nombre" className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none col-span-2" autoFocus />
          <input value={form.cedula} onChange={(e) => setForm({...form, cedula: e.target.value})} placeholder="Cedula" className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
          <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} placeholder="Telefono" className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
          <select value={form.position} onChange={(e) => setForm({...form, position: e.target.value})} className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white col-span-2">
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="col-span-2 flex gap-2">
            <button onClick={handleCreate} disabled={savingId === "new"} className="flex-1 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-1">
              {savingId === "new" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
            </button>
            <button onClick={() => { setCreating(false); resetForm(); }} className="px-3 py-1.5 bg-stone-200 text-stone-700 rounded-lg text-xs font-medium hover:bg-stone-300 flex items-center gap-1">
              <X size={12} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-stone-400 animate-pulse py-4 text-center">Cargando...</p>
      ) : employees.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-4">Sin empleados. {isAdmin && "Crea uno con el boton arriba."}</p>
      ) : (
        <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden">
          {employees.map((e) => {
            const isEditing = editingId === e.id;
            const isSaving = savingId === e.id;
            return (
              <div key={e.id} className={`px-3 py-2 ${!e.is_active ? "bg-stone-50 opacity-60" : "bg-white"}`}>
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={form.name} onChange={(ev) => setForm({...form, name: ev.target.value})} className="border border-stone-300 rounded px-2 py-1 text-sm col-span-2 focus:border-brand focus:outline-none" />
                    <input value={form.cedula} onChange={(ev) => setForm({...form, cedula: ev.target.value})} placeholder="Cedula" className="border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none" />
                    <input value={form.phone} onChange={(ev) => setForm({...form, phone: ev.target.value})} placeholder="Telefono" className="border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none" />
                    <select value={form.position} onChange={(ev) => setForm({...form, position: ev.target.value})} className="border border-stone-300 rounded px-2 py-1 text-sm bg-white col-span-2">
                      {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <div className="col-span-2 flex gap-1.5 justify-end">
                      <button onClick={saveEdit} disabled={isSaving} className="px-2 py-1 text-green-600 hover:bg-green-50 rounded text-xs">
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      </button>
                      <button onClick={() => { setEditingId(null); resetForm(); }} className="px-2 py-1 text-stone-500 hover:bg-stone-100 rounded text-xs">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800">{e.name}</p>
                      <p className="text-[11px] text-stone-500">
                        {e.position || "—"}
                        {e.phone && ` · ${e.phone}`}
                        {e.cedula && ` · CI ${e.cedula}`}
                      </p>
                    </div>
                    {isAdmin && (
                      <>
                        <button onClick={() => toggleActive(e)} disabled={isSaving} className={`w-9 h-5 rounded-full transition-colors shrink-0 ${e.is_active ? "bg-green-500" : "bg-stone-300"}`} title={e.is_active ? "Activo" : "Inactivo"}>
                          <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${e.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                        <button onClick={() => startEdit(e)} disabled={isSaving} className="p-1.5 text-stone-500 hover:bg-stone-100 rounded">
                          <Edit2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
