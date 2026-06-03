"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, Edit2, X, Check, Truck, Phone, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";

const PAYMENT_METHODS = [
  { id: "", label: "—" },
  { id: "pago_movil", label: "Pago Móvil" },
  { id: "zelle", label: "Zelle" },
  { id: "transferencia", label: "Transferencia" },
  { id: "cash_usd", label: "Cash USD" },
  { id: "cash_bs", label: "Cash Bs" },
];

const methodLabel = (id) => PAYMENT_METHODS.find((m) => m.id === id)?.label || "—";

export default function SuppliersEditor() {
  const [suppliers, setSuppliers] = useState([]);
  const [stats, setStats] = useState({}); // { supplier_id: { restocks_count, total_90d } }
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", default_payment_method: "", contact_phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [supRes, statsRes] = await Promise.all([
      supabase.from("suppliers").select("*").order("name"),
      supabase
        .from("cantina_restocks")
        .select("supplier_id, total_cost_ref, restock_date")
        .not("supplier_id", "is", null)
        .gte("restock_date", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
    ]);
    const aggr = {};
    (statsRes.data || []).forEach((r) => {
      if (!aggr[r.supplier_id]) aggr[r.supplier_id] = { restocks_count: 0, total_90d: 0 };
      aggr[r.supplier_id].restocks_count += 1;
      aggr[r.supplier_id].total_90d += Number(r.total_cost_ref || 0);
    });
    setStats(aggr);
    setSuppliers(supRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditForm({
      name: s.name || "",
      default_payment_method: s.default_payment_method || "",
      contact_phone: s.contact_phone || "",
      notes: s.notes || "",
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = async () => {
    if (!editForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("suppliers")
      .update({
        name: editForm.name.trim(),
        default_payment_method: editForm.default_payment_method || null,
        contact_phone: editForm.contact_phone.trim() || null,
        notes: editForm.notes.trim() || null,
      })
      .eq("id", editingId);
    if (error) { alert("Error: " + error.message); setSaving(false); return; }
    cancelEdit();
    await load();
    setSaving(false);
  };

  const toggleActive = async (s) => {
    const { error } = await supabase
      .from("suppliers")
      .update({ active: !s.active })
      .eq("id", s.id);
    if (error) { alert("Error: " + error.message); return; }
    await load();
  };

  const createSupplier = async () => {
    if (!newForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("suppliers").insert({
      name: newForm.name.trim(),
      default_payment_method: newForm.default_payment_method || null,
      contact_phone: newForm.contact_phone.trim() || null,
      notes: newForm.notes.trim() || null,
    });
    if (error) {
      alert("Error: " + error.message);
      setSaving(false);
      return;
    }
    setNewForm({ name: "", default_payment_method: "", contact_phone: "", notes: "" });
    setCreating(false);
    await load();
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-sm text-stone-700 flex items-center gap-2">
            <Truck size={16} /> Proveedores
          </h2>
          <p className="text-xs text-stone-400">A quién le compras inventario. Aparecen en Registrar entrada.</p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs bg-brand text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 hover:bg-brand-dark"
          >
            <Plus size={12} /> Nuevo
          </button>
        )}
      </div>

      {creating && (
        <div className="px-4 py-3 bg-brand/5 border-b border-stone-100 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Nombre</label>
              <input
                type="text"
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                placeholder="Nombre del proveedor"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Método de pago default</label>
              <select
                value={newForm.default_payment_method}
                onChange={(e) => setNewForm({ ...newForm, default_payment_method: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
              >
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Teléfono</label>
              <input
                type="text"
                value={newForm.contact_phone}
                onChange={(e) => setNewForm({ ...newForm, contact_phone: e.target.value })}
                placeholder="+58 414 1234567"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Notas</label>
              <input
                type="text"
                value={newForm.notes}
                onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                placeholder="Reparte martes/jueves, etc"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setCreating(false); setNewForm({ name: "", default_payment_method: "", contact_phone: "", notes: "" }); }}
              className="px-3 py-1.5 text-xs text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50"
            >Cancelar</button>
            <button
              onClick={createSupplier}
              disabled={!newForm.name.trim() || saving}
              className="px-4 py-1.5 text-xs bg-brand text-white rounded-lg font-bold hover:bg-brand-dark disabled:opacity-30 flex items-center gap-1"
            >
              {saving ? <><Loader2 size={12} className="animate-spin" /> Creando</> : <><Plus size={12} /> Crear proveedor</>}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="p-4 text-sm text-stone-400 animate-pulse">Cargando...</p>
      ) : suppliers.length === 0 ? (
        <p className="p-4 text-sm text-stone-400 text-center">Sin proveedores. Crea el primero arriba.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                <th className="text-left px-3 py-2 font-medium">Método default</th>
                <th className="text-left px-3 py-2 font-medium">Teléfono</th>
                <th className="text-right px-3 py-2 font-medium">Compras 90d</th>
                <th className="text-right px-3 py-2 font-medium">Total $ 90d</th>
                <th className="text-center px-3 py-2 font-medium">Activo</th>
                <th className="text-right px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => {
                const st = stats[s.id] || { restocks_count: 0, total_90d: 0 };
                const isEditing = editingId === s.id;
                if (isEditing) {
                  return (
                    <tr key={s.id} className="border-t border-stone-100 bg-brand/5">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editForm.default_payment_method}
                          onChange={(e) => setEditForm({ ...editForm, default_payment_method: e.target.value })}
                          className="w-full border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none bg-white"
                        >
                          {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editForm.contact_phone}
                          onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
                          placeholder="+58 …"
                          className="w-full border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-stone-400">{st.restocks_count}</td>
                      <td className="px-3 py-2 text-right text-xs text-stone-400">${st.total_90d.toFixed(2)}</td>
                      <td className="px-3 py-2 text-center text-xs text-stone-400">—</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={cancelEdit} className="p-1 text-stone-400 hover:text-stone-600"><X size={14} /></button>
                          <button onClick={saveEdit} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded">
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={s.id} className={`border-t border-stone-100 ${!s.active ? "opacity-50" : "hover:bg-stone-50/50"}`}>
                    <td className="px-3 py-2 font-medium text-stone-800">
                      {s.name}
                      {s.notes && <p className="text-[10px] text-stone-400 mt-0.5">{s.notes}</p>}
                    </td>
                    <td className="px-3 py-2 text-stone-600">{methodLabel(s.default_payment_method)}</td>
                    <td className="px-3 py-2 text-stone-600">{s.contact_phone || "—"}</td>
                    <td className="px-3 py-2 text-right text-stone-700 font-medium">{st.restocks_count}</td>
                    <td className="px-3 py-2 text-right text-stone-700 font-medium">${st.total_90d.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => toggleActive(s)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${s.active ? "bg-green-500" : "bg-stone-300"}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${s.active ? "translate-x-5" : "translate-x-1"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => startEdit(s)} className="p-1 text-stone-400 hover:text-brand">
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
