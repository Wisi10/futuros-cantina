"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Power, Lock, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";
import PromoFormModal from "./PromoFormModal";

export default function PromosConfigView({ user }) {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const isAdmin = user?.cantinaRole === "admin";

  const loadPromos = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("weekly_promos")
      .select("*, products!inner(id, name, active, stock_quantity)")
      .order("is_active", { ascending: false })
      .order("hours_threshold", { ascending: true });
    setPromos(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadPromos();
  }, [isAdmin, loadPromos]);

  const toggleActive = async (promo) => {
    if (togglingId) return;
    setTogglingId(promo.id);
    try {
      await supabase.rpc("update_weekly_promo", {
        promo_id_param:        promo.id,
        name_param:            null,
        court_tier_param:      null,
        hours_threshold_param: null,
        product_id_param:      null,
        is_active_param:       !promo.is_active,
        updated_by_param:      user?.name || "Admin",
      });
      await loadPromos();
    } catch (e) {
      alert("Error: " + e.message);
    }
    setTogglingId(null);
  };

  if (!isAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-3">
          <Lock size={28} className="text-stone-400" />
        </div>
        <h2 className="text-base font-bold text-stone-700 mb-1">Solo admin puede configurar promos</h2>
        <p className="text-sm text-stone-500 max-w-xs">
          Pide a Sam o Yusmelly que configure las promos. Tu si puedes ver el subtab Calificando.
        </p>
      </div>
    );
  }

  const activePromos = promos.filter((p) => p.is_active);
  const inactivePromos = promos.filter((p) => !p.is_active);

  return (
    <>
      <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-stone-700 flex items-center gap-2">
              <Gift size={16} /> Promos activas
            </h2>
            <p className="text-xs text-stone-400">Cada cliente puede canjear cada promo una vez por semana</p>
          </div>
          <button
            onClick={() => { setEditingPromo(null); setShowForm(true); }}
            className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark transition-colors flex items-center gap-1.5"
          >
            <Plus size={14} /> Crear nueva
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-stone-400 animate-pulse text-center py-8">Cargando promos...</p>
        ) : activePromos.length === 0 ? (
          <div className="bg-stone-50 border border-dashed border-stone-300 rounded-xl p-6 text-center">
            <Gift size={28} className="text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-500 font-medium">Sin promos activas</p>
            <p className="text-xs text-stone-400 mt-1">Crea la primera promo para empezar a premiar clientes</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activePromos.map((p) => (
              <PromoRow
                key={p.id}
                promo={p}
                onEdit={() => { setEditingPromo(p); setShowForm(true); }}
                onToggle={() => toggleActive(p)}
                toggling={togglingId === p.id}
              />
            ))}
          </div>
        )}

        {inactivePromos.length > 0 && (
          <div className="pt-3 border-t border-stone-200">
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="text-xs text-stone-500 hover:text-stone-700 font-medium"
            >
              {showInactive ? "Ocultar" : "Ver"} promos inactivas ({inactivePromos.length})
            </button>
            {showInactive && (
              <div className="mt-2 space-y-2">
                {inactivePromos.map((p) => (
                  <PromoRow
                    key={p.id}
                    promo={p}
                    onEdit={() => { setEditingPromo(p); setShowForm(true); }}
                    onToggle={() => toggleActive(p)}
                    toggling={togglingId === p.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <PromoFormModal
          user={user}
          promo={editingPromo}
          onClose={() => { setShowForm(false); setEditingPromo(null); }}
          onSaved={loadPromos}
        />
      )}
    </>
  );
}

function PromoRow({ promo, onEdit, onToggle, toggling }) {
  const productName = (promo.products?.name || "?").trim();
  const tierLabel =
    promo.court_tier === "any" ? "cualquier cancha"
    : promo.court_tier;
  const productActive = promo.products?.active;
  const productStock = promo.products?.stock_quantity ?? 0;

  return (
    <div className={`bg-white rounded-xl border p-3 ${promo.is_active ? "border-stone-200" : "border-stone-100 opacity-60"}`}>
      <div className="flex items-center gap-3">
        <div className="text-xl">🎁</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-stone-800 truncate">{(promo.name || "").trim()}</p>
          <p className="text-xs text-stone-500">
            {Number(promo.hours_threshold)} hrs {tierLabel} → {productName}
          </p>
          {promo.is_active && (!productActive || productStock <= 0) && (
            <p className="text-[10px] text-amber-600 mt-0.5">
              {!productActive ? "Producto inactivo" : "Sin stock"}: clientes no podran canjear
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-700"
            title="Editar"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={onToggle}
            disabled={toggling}
            className={`p-2 rounded-lg disabled:opacity-50 ${promo.is_active ? "text-stone-500 hover:bg-stone-100 hover:text-red-500" : "text-stone-400 hover:bg-stone-100 hover:text-green-600"}`}
            title={promo.is_active ? "Desactivar" : "Activar"}
          >
            <Power size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
