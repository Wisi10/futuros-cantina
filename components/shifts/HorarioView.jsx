"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, X, Loader2, Plus, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

const DAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
const DAYS_SHORT = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

const fmtTime = (t) => {
  if (!t) return "—";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
};

export default function HorarioView({ user }) {
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { employee_id, day_of_week, start_time, end_time, existingId }
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.cantinaRole === "admin";

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [empRes, tplRes] = await Promise.all([
      supabase.from("employees").select("id, name, position").eq("is_active", true).order("name"),
      supabase.from("employee_schedule_template").select("*"),
    ]);
    setEmployees(empRes.data || []);
    setTemplates(tplRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Index: { employee_id: { day_of_week: template } }
  const byEmpDay = useMemo(() => {
    const map = {};
    templates.forEach((t) => {
      if (!map[t.employee_id]) map[t.employee_id] = {};
      map[t.employee_id][t.day_of_week] = t;
    });
    return map;
  }, [templates]);

  const openCell = (empId, dow) => {
    if (!isAdmin) return;
    const existing = byEmpDay[empId]?.[dow];
    setEditing({
      employee_id: empId,
      day_of_week: dow,
      start_time: existing?.start_time?.slice(0, 5) || "10:00",
      end_time: existing?.end_time?.slice(0, 5) || "18:00",
      existingId: existing?.id || null,
      isActive: existing?.is_active !== false,
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    if (editing.existingId) {
      const { error } = await supabase.from("employee_schedule_template").update({
        start_time: editing.start_time,
        end_time: editing.end_time,
        is_active: true,
      }).eq("id", editing.existingId);
      if (error) { alert("Error: " + error.message); setSaving(false); return; }
    } else {
      const id = "esch_" + Math.random().toString(36).slice(2, 10);
      const { error } = await supabase.from("employee_schedule_template").insert({
        id,
        employee_id: editing.employee_id,
        day_of_week: editing.day_of_week,
        start_time: editing.start_time,
        end_time: editing.end_time,
        is_active: true,
      });
      if (error) { alert("Error: " + error.message); setSaving(false); return; }
    }
    setSaving(false);
    setEditing(null);
    await load();
  };

  const clearCell = async () => {
    if (!editing?.existingId) { setEditing(null); return; }
    if (!confirm("Quitar este horario?")) return;
    setSaving(true);
    const { error } = await supabase.from("employee_schedule_template").delete().eq("id", editing.existingId);
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    setEditing(null);
    await load();
  };

  if (loading) {
    return <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando horarios...</p>;
  }

  if (employees.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <Calendar size={32} className="text-stone-300 mx-auto mb-2" />
        <p className="text-sm text-stone-600 font-medium">Sin empleados registrados</p>
        <p className="text-xs text-stone-400 mt-1">Agrega empleados en Config {">"} Empleados primero.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-stone-500">
        Horario semanal recurrente. Click en una celda {isAdmin ? "para asignar/editar" : "(solo admin puede editar)"}.
      </p>

      <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[680px]">
          <thead>
            <tr className="bg-stone-50 text-stone-500 uppercase tracking-wider">
              <th className="text-left px-3 py-2 font-medium w-[160px]">Empleado</th>
              {DAYS_SHORT.map((d, i) => (
                <th key={i} className="text-center px-2 py-2 font-medium">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-t border-stone-100">
                <td className="px-3 py-2">
                  <div className="text-sm font-medium text-stone-800 truncate">{emp.name}</div>
                  {emp.position && <div className="text-[10px] text-stone-400">{emp.position}</div>}
                </td>
                {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                  const t = byEmpDay[emp.id]?.[dow];
                  const has = t && t.is_active !== false;
                  return (
                    <td key={dow} className="px-1 py-1 text-center">
                      <button
                        onClick={() => openCell(emp.id, dow)}
                        disabled={!isAdmin}
                        className={`w-full px-1.5 py-1.5 rounded text-[10px] transition-colors ${
                          has
                            ? "bg-brand/10 text-brand font-medium hover:bg-brand/20"
                            : "bg-stone-50 text-stone-300 hover:bg-stone-100"
                        } ${!isAdmin ? "cursor-default" : "cursor-pointer"}`}
                      >
                        {has ? (
                          <>
                            <div className="font-mono">{fmtTime(t.start_time)}</div>
                            <div className="font-mono">{fmtTime(t.end_time)}</div>
                          </>
                        ) : (
                          <Plus size={10} className="mx-auto" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-bold text-stone-800 text-sm">
                {employees.find((e) => e.id === editing.employee_id)?.name} · {DAYS[editing.day_of_week]}
              </h3>
              <button onClick={() => setEditing(null)} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Entrada</label>
                  <input
                    type="time"
                    value={editing.start_time}
                    onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Salida</label>
                  <input
                    type="time"
                    value={editing.end_time}
                    onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-3 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
              {editing.existingId && (
                <button onClick={clearCell} disabled={saving} className="px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg font-medium">
                  Quitar
                </button>
              )}
              <button onClick={() => setEditing(null)} disabled={saving} className="flex-1 px-3 py-2 text-xs text-stone-600 hover:bg-stone-100 rounded-lg font-medium">
                Cancelar
              </button>
              <button onClick={save} disabled={saving} className="flex-1 px-3 py-2 text-xs text-white bg-brand hover:bg-brand-dark rounded-lg font-medium flex items-center justify-center gap-1.5">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
