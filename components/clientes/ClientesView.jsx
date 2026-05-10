"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF } from "@/lib/utils";
import { avatarColor, avatarInitials, relativeFromNow, daysSince, formatVePhone } from "@/lib/clientHelpers";
import ClientProfileModal from "./ClientProfileModal";
import ClientFormModal from "./ClientFormModal";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "vip", label: "VIP" },
  { id: "active_month", label: "Activos mes" },
  { id: "inactive_60d", label: "Inactivos 60d" },
];

const SORTS = [
  { id: "recent", label: "Mas recientes" },
  { id: "most_pts", label: "Mas pts" },
  { id: "most_spent", label: "Mas gastado" },
  { id: "most_visits", label: "Mas visitas" },
];

export default function ClientesView({ user, rate }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_cantina_clients_summary", {
      p_search: debouncedSearch || null,
      p_filter: filter,
      p_sort: sort,
      p_limit: 200,
      p_offset: 0,
    });
    setRows(data || []);
    setLoading(false);
  }, [debouncedSearch, filter, sort]);

  useEffect(() => { load(); }, [load]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const activeMonth = rows.filter((r) => r.last_visit_at && (Date.now() - new Date(r.last_visit_at).getTime()) < 30 * 86400000).length;
    const vip = rows.filter((r) => r.is_vip).length;
    const ptsCirculating = rows.reduce((s, r) => s + Number(r.points_balance || 0), 0);
    return { total, activeMonth, vip, ptsCirculating };
  }, [rows]);

  return (
    <div className="h-full overflow-y-auto bg-brand-cream-light">
      <div className="max-w-5xl mx-auto p-3 md:p-6 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-brand" />
            <h1 className="text-lg font-bold text-brand">Clientes</h1>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 px-3 py-2 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark"
          >
            <Plus size={14} /> Nuevo cliente
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Total</p>
            <p className="text-xl font-bold text-stone-800">{kpis.total}</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Activos mes</p>
            <p className="text-xl font-bold text-stone-800">{kpis.activeMonth}</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">VIP</p>
            <p className="text-xl font-bold text-amber-600">{kpis.vip}</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Pts circulando</p>
            <p className="text-xl font-bold text-gold">{kpis.ptsCirculating.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-3 flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, telefono o cedula..."
              className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border border-stone-300 rounded-lg px-2 py-2 text-xs bg-white"
          >
            {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-stone-300 rounded-lg px-2 py-2 text-xs bg-white"
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          {loading ? (
            <p className="text-xs text-stone-400 animate-pulse text-center py-8">Cargando clientes...</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-8">Sin resultados</p>
          ) : (
            rows.map((r) => {
              const color = avatarColor(r.name || "");
              const days = daysSince(r.last_visit_at);
              const lastClass = days != null && days > 30 ? "text-red-600" : "text-stone-400";
              return (
                <button
                  key={r.client_id}
                  onClick={() => setProfileId(r.client_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-stone-100 last:border-0 hover:bg-stone-50 text-left"
                >
                  <div className={`w-10 h-10 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-sm font-bold shrink-0`}>
                    {avatarInitials(r.name || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-stone-800 truncate">{r.name || "(sin nombre)"}</p>
                      {r.is_vip && (
                        <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                          VIP
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 truncate">
                      {r.phone ? formatVePhone(r.phone) : "Sin telefono"}
                      {" · "}{r.total_visits || 0} visita{r.total_visits === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gold">{Number(r.points_balance || 0).toLocaleString()} pts</p>
                    <p className={`text-[11px] ${lastClass}`}>{relativeFromNow(r.last_visit_at)}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {profileId && (
        <ClientProfileModal
          clientId={profileId}
          user={user}
          onClose={() => setProfileId(null)}
          onUpdated={load}
        />
      )}

      {creating && (
        <ClientFormModal
          user={user}
          onClose={() => setCreating(false)}
          onSaved={async (newId) => {
            setCreating(false);
            await load();
            setProfileId(newId);
          }}
        />
      )}
    </div>
  );
}
