"use client";
import { useEffect, useState, useCallback } from "react";
import { X, Edit2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF } from "@/lib/utils";
import { avatarColor, avatarInitials, relativeFromNow, formatVePhone } from "@/lib/clientHelpers";
import ClientFormModal from "./ClientFormModal";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ClientProfileModal({ clientId, user, onClose, onUpdated }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data } = await supabase.rpc("get_cantina_client_profile", { p_client_id: clientId });
    setProfile(data || null);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (!clientId) return null;

  const c = profile?.client;
  const k = profile?.kpis || {};
  const favorites = profile?.favorites || [];
  const recent = profile?.recent || [];
  const fullName = c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(sin nombre)" : "";
  const color = avatarColor(fullName);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between p-5 border-b border-stone-200">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {c && (
                <div className={`w-14 h-14 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-lg font-bold shrink-0`}>
                  {avatarInitials(fullName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-stone-800 truncate">{fullName || "Cargando..."}</h2>
                  {k.is_vip && (
                    <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                      VIP
                    </span>
                  )}
                </div>
                {c && (
                  <p className="text-xs text-stone-500 truncate">
                    {c.phone ? formatVePhone(c.phone) : "Sin telefono"}
                    {c.cedula && ` · cedula ${c.cedula}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {c && (
                <button onClick={() => setEditing(true)} className="p-2 rounded-lg hover:bg-stone-100 text-stone-500" title="Editar">
                  <Edit2 size={14} />
                </button>
              )}
              <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg">
                <X size={18} className="text-stone-400" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <Loader2 size={20} className="animate-spin text-stone-400" />
            </div>
          ) : !profile ? (
            <div className="flex-1 flex items-center justify-center p-8 text-stone-400 text-sm">Cliente no encontrado</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-5 border-b border-stone-200">
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-0.5">Visitas</p>
                  <p className="text-xl font-bold text-stone-800">{k.visits || 0}</p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-0.5">Total gastado</p>
                  <p className="text-xl font-bold text-brand">{formatREF(k.total_ref || 0)}</p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-0.5">Pts actuales</p>
                  <p className="text-xl font-bold text-gold">{Number(k.points_balance || 0).toLocaleString()}</p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-0.5">Ultima visita</p>
                  <p className="text-sm font-bold text-stone-800">{relativeFromNow(k.last_visit_at)}</p>
                </div>
              </div>

              {/* Favoritos */}
              <div className="p-5 border-b border-stone-200">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-2">Productos favoritos</p>
                {favorites.length === 0 ? (
                  <p className="text-xs text-stone-400">Sin compras todavia.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {favorites.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 text-xs px-2 py-1 rounded-full">
                        {f.product_name} <span className="text-stone-400">({f.count}x)</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Historial reciente */}
              <div className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-2">Historial reciente</p>
                {recent.length === 0 ? (
                  <p className="text-xs text-stone-400">Sin ventas.</p>
                ) : (
                  <div className="space-y-1.5">
                    {recent.map((s) => {
                      const items = Array.isArray(s.items) ? s.items : [];
                      const summary = items.slice(0, 3).map((i) => `${i.name} x${i.qty}`).join(" + ");
                      const more = items.length > 3 ? ` +${items.length - 3}` : "";
                      return (
                        <div key={s.id} className="flex items-center justify-between text-sm border-b border-stone-100 pb-1.5 last:border-0 last:pb-0">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-stone-500">{fmtDate(s.created_at)}</p>
                            <p className="text-stone-700 truncate">{summary}{more}</p>
                          </div>
                          <span className="font-medium text-stone-800 ml-2 shrink-0">{formatREF(s.total_ref)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ClientFormModal
          client={c}
          user={user}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
            if (onUpdated) await onUpdated();
          }}
        />
      )}
    </>
  );
}
