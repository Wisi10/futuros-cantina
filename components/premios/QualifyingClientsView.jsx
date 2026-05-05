"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Trophy, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ClientPromoCard from "./ClientPromoCard";

const FILTERS = [
  { id: "all",       label: "Todos" },
  { id: "available", label: "Disponibles" },
  { id: "redeemed",  label: "Canjeados" },
  { id: "pending",   label: "En camino" },
];

export default function QualifyingClientsView({ user, onClientClick }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [redeeming, setRedeeming] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase.rpc("get_qualifying_clients_this_week");
      setClients(data || []);
    } catch (e) {
      console.error("[PREMIOS] load error:", e);
      setClients([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = {
    all:       clients.length,
    available: clients.filter((c) => c.has_pending).length,
    redeemed:  clients.filter((c) => Array.isArray(c.qualifying_promos) && c.qualifying_promos.some((p) => p.status === "redeemed")).length,
    pending:   clients.filter((c) => !c.has_pending && Array.isArray(c.qualifying_promos) && c.qualifying_promos.some((p) => p.status === "pending")).length,
  };

  const filtered = clients.filter((c) => {
    if (filter === "all")       return true;
    if (filter === "available") return c.has_pending;
    if (filter === "redeemed")  return Array.isArray(c.qualifying_promos) && c.qualifying_promos.some((p) => p.status === "redeemed");
    if (filter === "pending")   return !c.has_pending && Array.isArray(c.qualifying_promos) && c.qualifying_promos.some((p) => p.status === "pending");
    return true;
  });

  const handleRedeem = (promo, client) => {
    setConfirm({ promo, client });
  };

  const executeRedeem = async () => {
    if (!confirm || redeeming) return;
    const { promo, client } = confirm;
    setRedeeming(promo.promo_id);
    try {
      const { data, error } = await supabase.rpc("redeem_weekly_promo", {
        promo_id_param:    promo.promo_id,
        client_id_param:   client.client_id,
        sale_id_param:     null,
        redeemed_by_param: user?.name || "Staff",
      });
      if (error) throw error;
      const result = data?.[0];
      if (!result?.success) {
        alert("No se pudo canjear: " + (result?.message || "Error"));
      } else {
        await load();
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setRedeeming(null);
    setConfirm(null);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 pt-4 pb-3 border-b border-stone-200 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-stone-700 flex items-center gap-2">
            <Trophy size={16} /> Esta semana
          </h2>
          <p className="text-xs text-stone-400">Clientes con horas acumuladas de alquiler</p>
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

      <div className="px-4 md:px-6 py-2 border-b border-stone-200 flex gap-2 overflow-x-auto shrink-0">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.id
                ? "bg-brand text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {f.label} ({counts[f.id] || 0})
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 md:p-4 space-y-2">
        {loading ? (
          <p className="text-xs text-stone-400 animate-pulse text-center py-8">Cargando...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Users size={28} className="text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-500 font-medium">
              {clients.length === 0 ? "Sin clientes con horas esta semana" : "Sin clientes en este filtro"}
            </p>
            <p className="text-xs text-stone-400 mt-1">
              {clients.length === 0 ? "Tan pronto haya reservas tipo alquiler, aparecen aqui" : "Cambia el filtro arriba"}
            </p>
          </div>
        ) : (
          filtered.map((c) => (
            <ClientPromoCard
              key={c.client_id}
              client={c}
              onRedeem={handleRedeem}
              onViewProfile={onClientClick}
              redeemingPromoId={redeeming}
            />
          ))
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !redeeming && setConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-stone-800 mb-1">Entregar premio?</h3>
            <p className="text-sm text-stone-600 mb-1">
              <span className="font-bold">{(confirm.promo.product_name || "").trim()}</span> a{" "}
              <span className="font-bold">{(confirm.client.client_name || "").trim().replace(/\s+/g, " ")}</span>
            </p>
            <p className="text-xs text-stone-400 mb-4">
              Promo: {(confirm.promo.promo_name || "").trim()} · Stock se decrementa automaticamente
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={!!redeeming}
                className="flex-1 py-3 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={executeRedeem}
                disabled={!!redeeming}
                className="flex-1 py-3 rounded-xl bg-gold text-white font-bold text-sm hover:bg-gold-hover disabled:opacity-50"
              >
                {redeeming ? "Entregando..." : "Si, entregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
