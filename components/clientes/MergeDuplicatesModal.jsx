"use client";
import { useEffect, useState, useCallback } from "react";
import { X, Loader2, AlertTriangle, Check, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function MergeDuplicatesModal({ onClose, onMerged }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [selection, setSelection] = useState({}); // { groupKey: { keepId, mergeIds: [] } }

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("find_duplicate_clients");
    if (error) { alert("Error: " + error.message); setLoading(false); return; }
    setGroups(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getKeepId = (g) => selection[g.group_key]?.keepId || g.clients[0]?.id;
  const getMergeIds = (g) => {
    const sel = selection[g.group_key];
    if (sel?.mergeIds) return sel.mergeIds;
    return g.clients.slice(1).map((c) => c.id);
  };

  const updateSelection = (groupKey, patch) => {
    setSelection((prev) => ({ ...prev, [groupKey]: { ...(prev[groupKey] || {}), ...patch } }));
  };

  const handleMergeGroup = async (g) => {
    const keepId = getKeepId(g);
    const mergeIds = getMergeIds(g).filter((id) => id !== keepId);
    if (mergeIds.length === 0) { alert("Selecciona al menos 1 duplicado para fusionar"); return; }
    if (!confirm(`Fusionar ${mergeIds.length} duplicado(s) hacia el cliente seleccionado? Esta accion es irreversible.`)) return;

    setMerging(true);
    try {
      for (const dupeId of mergeIds) {
        const { error } = await supabase.rpc("merge_clients", { p_keep_id: keepId, p_dupe_id: dupeId });
        if (error) throw error;
      }
      await load();
      if (onMerged) onMerged();
    } catch (err) {
      alert("Error en merge: " + err.message);
    }
    setMerging(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0">
          <h2 className="font-bold text-stone-800 flex items-center gap-2">
            <Users size={16} className="text-brand" /> Fusionar duplicados
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600" disabled={merging}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 shrink-0">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Duplicados agrupados por telefono normalizado. Selecciona el cliente que <b>mantener</b> (radio) y los duplicados <b>a fusionar</b> (checkboxes). Toda la historia (puntos, creditos, ventas, reservas) se transfiere al cliente mantenido.
          </p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          {loading ? (
            <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando duplicados...</p>
          ) : groups.length === 0 ? (
            <div className="text-center py-12">
              <Check size={32} className="text-green-500 mx-auto mb-2" />
              <p className="text-sm text-stone-600 font-medium">No hay duplicados detectados</p>
              <p className="text-xs text-stone-400 mt-1">Los duplicados se agrupan por telefono normalizado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const isOpen = expanded === g.group_key;
                const keepId = getKeepId(g);
                const mergeIds = getMergeIds(g);
                return (
                  <div key={g.group_key} className="border border-stone-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpanded(isOpen ? null : g.group_key)}
                      className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-stone-50 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-stone-500">{g.clients[0]?.phone || "(sin telefono)"}</span>
                        <span className="text-sm font-medium text-stone-800">{g.clients[0]?.full_name}</span>
                      </div>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                        {g.dupe_count} duplicados
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-stone-100 bg-stone-50 px-3 py-3 space-y-2">
                        {g.clients.map((c) => {
                          const isKept = c.id === keepId;
                          const willMerge = mergeIds.includes(c.id) && !isKept;
                          return (
                            <div
                              key={c.id}
                              className={`bg-white border rounded-lg p-2 flex items-start gap-2 ${
                                isKept ? "border-green-400 ring-1 ring-green-100" : willMerge ? "border-red-300" : "border-stone-200"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`keep_${g.group_key}`}
                                checked={isKept}
                                onChange={() => updateSelection(g.group_key, {
                                  keepId: c.id,
                                  mergeIds: g.clients.map((x) => x.id).filter((id) => id !== c.id),
                                })}
                                disabled={merging}
                                className="mt-1"
                                title="Mantener este"
                              />
                              {!isKept && (
                                <input
                                  type="checkbox"
                                  checked={willMerge}
                                  onChange={(e) => {
                                    const newMerge = e.target.checked
                                      ? [...mergeIds.filter((id) => id !== c.id), c.id]
                                      : mergeIds.filter((id) => id !== c.id);
                                    updateSelection(g.group_key, { mergeIds: newMerge });
                                  }}
                                  disabled={merging}
                                  className="mt-1"
                                  title="Fusionar este"
                                />
                              )}
                              {isKept && <span className="w-3.5 inline-block" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-stone-800">
                                  {c.full_name}
                                  {isKept && <span className="ml-2 text-[10px] uppercase tracking-wider text-green-600 font-bold">Mantener</span>}
                                  {willMerge && <span className="ml-2 text-[10px] uppercase tracking-wider text-red-600 font-bold">Fusionar</span>}
                                </p>
                                <p className="text-[11px] text-stone-500 mt-0.5">
                                  ID: <span className="font-mono">{c.id}</span>
                                  {c.cedula ? ` · CI ${c.cedula}` : ""}
                                  {c.email ? ` · ${c.email}` : ""}
                                </p>
                                <p className="text-[11px] text-stone-400 mt-0.5">
                                  {c.sales_count}v cantina · {c.bookings_count} reservas · {c.loyalty_points}pts ·
                                  {" "}creado {c.created_at ? new Date(c.created_at).toLocaleDateString("es-VE") : "?"}
                                </p>
                              </div>
                            </div>
                          );
                        })}

                        <div className="flex justify-end pt-2">
                          <button
                            onClick={() => handleMergeGroup(g)}
                            disabled={merging || mergeIds.length === 0}
                            className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {merging ? <Loader2 size={12} className="animate-spin" /> : null}
                            Fusionar {mergeIds.length} duplicado{mergeIds.length !== 1 ? "s" : ""}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
