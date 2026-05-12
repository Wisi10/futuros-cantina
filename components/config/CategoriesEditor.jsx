"use client";
import { useEffect, useState, useCallback } from "react";
import { Tag, Plus, Edit2, Trash2, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function CategoriesEditor({ user }) {
  const [categories, setCategories] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState(null);

  const isAdmin = user?.cantinaRole === "gerente" || user?.cantinaRole === "owner" || user?.cantinaRole === "admin";

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from("product_categories").select("*").order("sort_order").order("name"),
      supabase.from("products").select("category"),
    ]);
    setCategories(cats || []);
    const cntMap = {};
    (prods || []).forEach((p) => {
      const k = p.category || "Otro";
      cntMap[k] = (cntMap[k] || 0) + 1;
    });
    setCounts(cntMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      alert("Ya existe una categoria con ese nombre");
      return;
    }
    const id = "cat_" + Math.random().toString(36).slice(2, 10);
    const { error } = await supabase.from("product_categories").insert({
      id, name, sort_order: 50, active: true,
    });
    if (error) { alert("Error: " + error.message); return; }
    setNewName(""); setAdding(false);
    await load();
  };

  const startEdit = (c) => { setEditingId(c.id); setEditName(c.name); };
  const cancelEdit = () => { setEditingId(null); setEditName(""); };

  const saveEdit = async (c) => {
    const next = editName.trim();
    if (!next || next === c.name) { cancelEdit(); return; }
    setSavingId(c.id);
    const { data, error } = await supabase.rpc("rename_product_category", {
      p_old_name: c.name,
      p_new_name: next,
    });
    setSavingId(null);
    if (error || !data?.success) {
      alert("Error: " + (error?.message || data?.error || "no se pudo renombrar"));
      return;
    }
    cancelEdit();
    await load();
  };

  const handleDelete = async (c) => {
    const cnt = counts[c.name] || 0;
    if (cnt > 0) {
      alert(`No se puede borrar: ${cnt} producto${cnt === 1 ? "" : "s"} usa${cnt === 1 ? "" : "n"} esta categoria. Renombra o reasigna primero.`);
      return;
    }
    if (!window.confirm(`Borrar categoria "${c.name}"?`)) return;
    setSavingId(c.id);
    const { error } = await supabase.from("product_categories").delete().eq("id", c.id);
    setSavingId(null);
    if (error) { alert("Error: " + error.message); return; }
    await load();
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm text-stone-700 flex items-center gap-2">
          <Tag size={14} /> Categorias de productos
        </h2>
        {isAdmin && !adding && (
          <button onClick={() => setAdding(true)} className="px-2 py-1 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark flex items-center gap-1">
            <Plus size={12} /> Nueva
          </button>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 mb-3 bg-stone-50 rounded-lg p-2">
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre de categoria"
            className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none"
          />
          <button onClick={handleAdd} disabled={!newName.trim()} className="p-1.5 rounded bg-brand text-white disabled:opacity-50">
            <Check size={14} />
          </button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="p-1.5 rounded hover:bg-stone-200 text-stone-500">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-stone-400 animate-pulse text-center py-4">Cargando...</p>
      ) : categories.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-4">Sin categorias. Crea la primera arriba.</p>
      ) : (
        <div className="space-y-1">
          {categories.map((c) => {
            const cnt = counts[c.name] || 0;
            const isEditing = editingId === c.id;
            const isSaving = savingId === c.id;
            const canDelete = cnt === 0 && isAdmin;
            return (
              <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-50">
                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none"
                  />
                ) : (
                  <span className="flex-1 text-sm text-stone-800">{c.name}</span>
                )}
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${cnt === 0 ? "bg-stone-100 text-stone-500" : "bg-stone-200 text-stone-700"}`}>
                  {cnt}
                </span>
                {isAdmin && (
                  <div className="flex items-center gap-0.5">
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEdit(c)} disabled={isSaving} className="p-1.5 rounded bg-brand text-white disabled:opacity-50">
                          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button onClick={cancelEdit} disabled={isSaving} className="p-1.5 rounded hover:bg-stone-200 text-stone-500">
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(c)} className="p-1.5 rounded hover:bg-stone-100 text-stone-500" title="Renombrar">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => handleDelete(c)} disabled={!canDelete || isSaving} className="p-1.5 rounded hover:bg-stone-100 text-stone-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed" title={canDelete ? "Borrar" : "No se puede: hay productos usando"}>
                          <Trash2 size={12} />
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
