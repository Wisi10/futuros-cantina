"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Power, Gift, Loader2, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ProductImage, calculateRewardGenerosity } from "@/lib/utils";
import RewardTimelineChart from "./RewardTimelineChart";
import MarkRedeemableModal from "./MarkRedeemableModal";

export default function RewardsConfigView({ user, saleClient }) {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editPts, setEditPts] = useState("");
  const [savingId, setSavingId] = useState(null);

  const isAdmin = user?.cantinaRole === "admin";
  const clientPoints = Number(saleClient?.points || 0);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("id, name, photo_url, emoji, is_redeemable, redemption_cost_points, active, stock_quantity, is_cantina, price_ref")
      .eq("is_redeemable", true)
      .eq("active", true)
      .order("redemption_cost_points", { ascending: true });
    setRewards(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditPts(String(r.redemption_cost_points || ""));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPts("");
  };

  const saveEdit = async (r) => {
    const pts = Number(editPts);
    if (!pts || pts <= 0) return;
    setSavingId(r.id);
    try {
      const { error } = await supabase
        .from("products")
        .update({ redemption_cost_points: pts })
        .eq("id", r.id);
      if (error) throw error;
      await load();
      setEditingId(null);
      setEditPts("");
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSavingId(null);
  };

  const toggleRedeemable = async (r) => {
    if (savingId) return;
    if (!window.confirm(`Desactivar "${r.name}" como premio? Los clientes ya no podran canjearlo.`)) return;
    setSavingId(r.id);
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_redeemable: false })
        .eq("id", r.id);
      if (error) throw error;
      await load();
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSavingId(null);
  };

  return (
    <>
      <div className="p-4 md:p-6 space-y-4">
        <RewardTimelineChart rewards={rewards} clientPoints={saleClient ? clientPoints : null} />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-stone-700 flex items-center gap-2">
              <Gift size={16} /> Premios configurados
            </h2>
            <p className="text-xs text-stone-400">Productos canjeables con puntos de loyalty</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowMarkModal(true)}
              className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark transition-colors flex items-center gap-1.5"
            >
              <Plus size={14} /> Marcar producto como premio
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-stone-400 animate-pulse text-center py-8">Cargando premios...</p>
        ) : rewards.length === 0 ? (
          <div className="bg-stone-50 border border-dashed border-stone-300 rounded-xl p-6 text-center">
            <Gift size={28} className="text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-500 font-medium">Sin premios configurados</p>
            <p className="text-xs text-stone-400 mt-1">Marca un producto como canjeable arriba</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rewards.map((r) => {
              const stock = Number(r.stock_quantity || 0);
              const lowStock = stock <= 0;
              const isEditing = editingId === r.id;
              const isSaving = savingId === r.id;
              const cost = Number(r.redemption_cost_points || 0);
              const canRedeem = saleClient && cost > 0 && clientPoints >= cost;
              const cantRedeem = saleClient && cost > 0 && clientPoints < cost;
              const missingPts = cantRedeem ? cost - clientPoints : 0;
              const generosity = calculateRewardGenerosity(r.price_ref, cost);

              const rowClass = canRedeem
                ? "bg-green-50 border-green-600"
                : cantRedeem
                  ? "bg-white border-stone-200 opacity-60"
                  : "bg-white border-stone-200";

              return (
                <div key={r.id} className={`rounded-xl border p-3 ${rowClass}`}>
                  <div className="flex items-center gap-3">
                    <ProductImage product={r} size={40} className="rounded" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-stone-800 truncate">{(r.name || "").trim()}</p>
                        {canRedeem && (
                          <span className="inline-block bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                            Canjeable
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-stone-500 flex-wrap">
                        {isEditing ? (
                          <span className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              step="50"
                              value={editPts}
                              onChange={(e) => setEditPts(e.target.value)}
                              className="w-24 border border-stone-300 rounded px-2 py-1 text-xs"
                              autoFocus
                            />
                            <span className="text-gold font-medium">pts</span>
                          </span>
                        ) : (
                          <span className="text-gold font-bold">{cost.toLocaleString()} pts</span>
                        )}
                        <span className={lowStock ? "text-red-500 font-medium" : "text-stone-400"}>
                          · stock: {stock}
                        </span>
                        {!r.is_cantina && (
                          <span className="text-amber-600">· no es cantina</span>
                        )}
                        {cantRedeem ? (
                          <span className="text-stone-500">· faltan {missingPts.toLocaleString()} pts</span>
                        ) : !canRedeem && !isEditing && (
                          <span className={`font-medium ${generosity.color}`}>· {generosity.display}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(r)}
                            disabled={isSaving || !Number(editPts)}
                            className="p-2 rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-50"
                            title="Guardar"
                          >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isSaving}
                            className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50"
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : isAdmin ? (
                        <>
                          <button
                            onClick={() => startEdit(r)}
                            className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-700"
                            title="Editar costo"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => toggleRedeemable(r)}
                            disabled={isSaving}
                            className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-red-500 disabled:opacity-50"
                            title="Desactivar como premio"
                          >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showMarkModal && (
        <MarkRedeemableModal
          user={user}
          onClose={() => setShowMarkModal(false)}
          onMarked={load}
        />
      )}
    </>
  );
}
