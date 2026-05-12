"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Plus, Users, Merge } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF } from "@/lib/utils";
import { avatarColor, avatarInitials, relativeFromNow, daysSince, formatVePhone } from "@/lib/clientHelpers";
import ClientProfileModal from "./ClientProfileModal";
import ClientFormModal from "./ClientFormModal";
import MergeDuplicatesModal from "./MergeDuplicatesModal";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "vip", label: "VIP" },
  { id: "active_month", label: "Activos mes" },
  { id: "inactive_60d", label: "Inactivos 60d" },
  { id: "debtors", label: "Deudores" },
];

const SORTS = [
  { id: "recent", label: "Mas recientes" },
  { id: "most_pts", label: "Mas pts" },
  { id: "most_spent", label: "Mas gastado" },
  { id: "most_visits", label: "Mas visitas" },
  { id: "most_debt", label: "Mas deuda" },
  { id: "most_cortesia", label: "Mas cortesias" },
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
  const [mergeOpen, setMergeOpen] = useState(false);
  const isAdmin = user?.cantinaRole === "gerente" || user?.cantinaRole === "owner" || user?.cantinaRole === "admin";

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
      p_limit: 5000,
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
    const totalDebt = rows.reduce((s, r) => s + Number(r.pending_credit_ref || 0), 0);
    const debtorsCount = rows.filter((r) => Number(r.pending_credit_ref || 0) > 0).length;
    const totalCortesia = rows.reduce((s, r) => s + Number(r.cortesia_ref || 0), 0);
    return { total, activeMonth, vip, ptsCirculating, totalDebt, debtorsCount, totalCortesia };
  }, [rows]);

  const rankings = useMemo(() => {
    const byField = (field, n = 5) => [...rows]
      .filter((r) => Number(r[field] || 0) > 0)
      .sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0))
      .slice(0, n);
    return {
      topSpent: byField("total_spent_ref"),
      topDebt: byField("pending_credit_ref"),
      topPts: byField("points_balance"),
      topCortesia: byField("cortesia_ref"),
    };
  }, [rows]);

  const [showRankings, setShowRankings] = useState(false);

  return (
    <div className="h-full overflow-y-auto bg-brand-cream-light">
      <div className="max-w-5xl mx-auto p-3 md:p-6 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-brand" />
            <h1 className="text-lg font-bold text-brand">Clientes</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setMergeOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-2 bg-stone-100 text-stone-700 rounded-lg text-xs font-medium hover:bg-stone-200"
                title="Fusionar duplicados"
              >
                <Merge size={14} /> Duplicados
              </button>
            )}
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 px-3 py-2 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark"
            >
              <Plus size={14} /> Nuevo cliente
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
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
          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Deuda total</p>
            <p className={`text-xl font-bold ${kpis.totalDebt > 0 ? "text-red-600" : "text-stone-400"}`}>{formatREF(kpis.totalDebt)}</p>
            <p className="text-[10px] text-stone-400 mt-0.5">{kpis.debtorsCount} deudor{kpis.debtorsCount !== 1 ? "es" : ""}</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Cortesias</p>
            <p className={`text-xl font-bold ${kpis.totalCortesia > 0 ? "text-violet-600" : "text-stone-400"}`}>{formatREF(kpis.totalCortesia)}</p>
            <p className="text-[10px] text-stone-400 mt-0.5">total regalado</p>
          </div>
        </div>

        {/* Rankings panel */}
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowRankings(!showRankings)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-stone-50 transition-colors"
          >
            <span className="text-sm font-bold text-stone-700">Top rankings</span>
            <span className="text-xs text-stone-400">{showRankings ? "Ocultar" : "Mostrar"}</span>
          </button>
          {showRankings && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-stone-50/30 border-t border-stone-100">
              <RankCard title="Top que mas gastan" items={rankings.topSpent} valueFn={(r) => formatREF(Number(r.total_spent_ref || 0))} onClick={setProfileId} />
              <RankCard title="Mayor deuda pendiente" items={rankings.topDebt} valueFn={(r) => formatREF(Number(r.pending_credit_ref || 0))} valueColor="text-red-600" onClick={setProfileId} />
              <RankCard title="Mas puntos" items={rankings.topPts} valueFn={(r) => `${Number(r.points_balance || 0).toLocaleString()} pts`} valueColor="text-gold" onClick={setProfileId} />
              <RankCard title="Mas cortesias recibidas" items={rankings.topCortesia} valueFn={(r) => `${formatREF(Number(r.cortesia_ref || 0))} · ${r.cortesia_count}x`} valueColor="text-violet-600" onClick={setProfileId} />
            </div>
          )}
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

      {mergeOpen && (
        <MergeDuplicatesModal
          onClose={() => setMergeOpen(false)}
          onMerged={() => load()}
        />
      )}
    </div>
  );
}

function RankCard({ title, items, valueFn, valueColor, onClick }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100 bg-stone-50">
        <h4 className="text-[10px] uppercase tracking-wider font-bold text-stone-600">{title}</h4>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-3">Sin datos</p>
      ) : (
        <div className="divide-y divide-stone-100">
          {items.map((r, i) => (
            <button
              key={r.client_id}
              onClick={() => onClick && onClick(r.client_id)}
              className="w-full px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-stone-50 text-left"
            >
              <span className="text-stone-300 font-mono w-4">{i + 1}</span>
              <span className="flex-1 truncate text-stone-700">{r.name || "(sin nombre)"}</span>
              <span className={`font-bold ${valueColor || "text-stone-700"}`}>{valueFn(r)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
