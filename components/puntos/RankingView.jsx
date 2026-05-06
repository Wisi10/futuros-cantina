"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, Trophy, Users, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";

function formatExpiry(daysToExpiry) {
  const days = Number(daysToExpiry || 0);
  if (days <= 0) return "Caducado";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mes${months !== 1 ? "es" : ""}`;
  return `${Math.floor(months / 12)} an${Math.floor(months / 12) !== 1 ? "os" : "o"}`;
}

export default function RankingView({ user, onClientClick }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_loyalty_ranking", { limit_param: 20 });
      setRows(data || []);
    } catch (e) {
      console.error("[PUNTOS RANKING] error:", e);
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 pt-4 pb-3 border-b border-stone-200 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-stone-700 flex items-center gap-2">
            <Trophy size={16} /> Top 20 clientes
          </h2>
          <p className="text-xs text-stone-400">Ordenado por puntos acumulados</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 md:p-4 space-y-2">
        {loading ? (
          <p className="text-xs text-stone-400 animate-pulse text-center py-8">Cargando...</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <Users size={28} className="text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-500 font-medium">Sin clientes con puntos</p>
            <p className="text-xs text-stone-400 mt-1">
              Tan pronto haya ventas con cliente asociado, los puntos se acumulan automaticamente.
            </p>
          </div>
        ) : (
          rows.map((r, idx) => {
            const days = Number(r.days_to_expiry || 0);
            const expiringSoon = days > 0 && days < 30;
            const expired = days <= 0;
            const name = (r.client_name || "?").trim().replace(/\s+/g, " ");
            const balance = Number(r.points_balance || 0);
            return (
              <button
                key={r.client_id}
                onClick={() => onClientClick?.(r.client_id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  expired
                    ? "bg-stone-100 border-stone-200 opacity-60"
                    : expiringSoon
                    ? "bg-amber-50 border-amber-200 hover:border-amber-300"
                    : "bg-white border-stone-200 hover:border-brand"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    idx === 0 ? "bg-gold text-white"
                    : idx === 1 ? "bg-stone-300 text-stone-700"
                    : idx === 2 ? "bg-amber-700 text-white"
                    : "bg-stone-100 text-stone-500"
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-stone-800 truncate">{name}</p>
                    <p className="text-[11px] text-stone-500">
                      {r.client_cedula ? `CI: ${r.client_cedula}` : "Sin cedula"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-gold">{balance.toLocaleString()}</p>
                    <p className="text-[10px] text-stone-400 uppercase tracking-wider">pts</p>
                  </div>
                  <div className="text-right shrink-0 ml-3 min-w-[80px]">
                    <p className={`text-xs font-medium flex items-center justify-end gap-1 ${
                      expired ? "text-red-500"
                      : expiringSoon ? "text-amber-600"
                      : "text-stone-500"
                    }`}>
                      {expiringSoon && <AlertTriangle size={11} />}
                      {formatExpiry(days)}
                    </p>
                    <p className="text-[10px] text-stone-400">caducidad</p>
                  </div>
                  <ExternalLink size={12} className="text-stone-300 shrink-0" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
