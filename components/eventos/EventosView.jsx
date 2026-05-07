"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs, calcBs } from "@/lib/utils";
import EventDetailModal from "./EventDetailModal";
import SettleEventModal from "./SettleEventModal";

const MONTH_LABELS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

function buildMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = -12; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
    opts.push({ key, label });
  }
  return opts;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function EventosView({ user, rate }) {
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [statusFilter, setStatusFilter] = useState("pending");
  const [events, setEvents] = useState([]);
  const [itemsByEvent, setItemsByEvent] = useState({});
  const [productsById, setProductsById] = useState({});
  const [clientsById, setClientsById] = useState({});
  const [packagesById, setPackagesById] = useState({});
  const [transfersThisMonth, setTransfersThisMonth] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [settlingEvent, setSettlingEvent] = useState(null);

  const monthOptions = useMemo(buildMonthOptions, []);

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    const { first, last } = monthRange(monthFilter);

    const { data: evs } = await supabase
      .from("events")
      .select("*")
      .gte("event_date", first)
      .lte("event_date", last)
      .order("event_date", { ascending: false });
    const evList = evs || [];

    const eventIds = evList.map((e) => e.id);
    const clientIds = [...new Set(evList.map((e) => e.client_id).filter(Boolean))];
    const packageIds = [...new Set(evList.map((e) => e.package_id).filter(Boolean))];

    let items = [];
    if (eventIds.length) {
      const { data } = await supabase.from("event_items").select("*").in("event_id", eventIds);
      items = data || [];
    }

    const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
    let products = [];
    if (productIds.length) {
      const { data } = await supabase
        .from("products")
        .select("id, name, cost_ref")
        .in("id", productIds);
      products = data || [];
    }

    let clients = [];
    if (clientIds.length) {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", clientIds);
      clients = data || [];
    }

    let packages = [];
    if (packageIds.length) {
      const { data } = await supabase
        .from("birthday_packages")
        .select("id, name")
        .in("id", packageIds);
      packages = data || [];
    }

    const { data: transfers } = await supabase
      .from("intercompany_transfers")
      .select("id, amount_ref, created_at")
      .gte("created_at", `${first}T00:00:00`)
      .lte("created_at", `${last}T23:59:59`);

    const itemsMap = {};
    items.forEach((it) => {
      if (!itemsMap[it.event_id]) itemsMap[it.event_id] = [];
      itemsMap[it.event_id].push(it);
    });

    const prodMap = {};
    products.forEach((p) => { prodMap[p.id] = p; });

    const clientMap = {};
    clients.forEach((c) => { clientMap[c.id] = c; });

    const pkgMap = {};
    packages.forEach((p) => { pkgMap[p.id] = p.name; });

    setEvents(evList);
    setItemsByEvent(itemsMap);
    setProductsById(prodMap);
    setClientsById(clientMap);
    setPackagesById(pkgMap);
    setTransfersThisMonth(transfers || []);
    setLoading(false);
  }, [monthFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const eventCostTotal = useCallback((eventId) => {
    const items = itemsByEvent[eventId] || [];
    return items.reduce((sum, it) => {
      const cost = Number(productsById[it.product_id]?.cost_ref || 0);
      return sum + cost * Number(it.quantity || 0);
    }, 0);
  }, [itemsByEvent, productsById]);

  const kpis = useMemo(() => {
    let saldoRef = 0;
    let pending = 0;
    events.forEach((e) => {
      if (!e.is_settled) {
        pending += 1;
        saldoRef += eventCostTotal(e.id);
      }
    });
    const settledMonthRef = transfersThisMonth.reduce(
      (s, t) => s + Number(t.amount_ref || 0), 0
    );
    return {
      saldoRef,
      saldoBs: calcBs(saldoRef, rate?.eur),
      pendingCount: pending,
      settledMonthRef,
    };
  }, [events, eventCostTotal, transfersThisMonth, rate]);

  const filteredEvents = useMemo(() => {
    if (statusFilter === "pending") return events.filter((e) => !e.is_settled);
    if (statusFilter === "settled") return events.filter((e) => e.is_settled);
    return events;
  }, [events, statusFilter]);

  const clientName = (id) => {
    const c = clientsById[id];
    if (!c) return "—";
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
  };
  const packageName = (id) => packagesById[id] || id || "—";

  return (
    <div className="h-full overflow-y-auto bg-brand-cream-light">
      <div className="max-w-7xl mx-auto p-3 md:p-6 space-y-3 md:space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1 bg-white rounded-2xl p-4 md:p-5 border border-stone-200">
            <div className="text-xs text-stone-500 mb-1">Saldo a favor de cantina</div>
            <div className="text-2xl md:text-3xl font-bold text-brand">
              {formatREF(kpis.saldoRef)}
            </div>
            <div className="text-sm text-stone-500 mt-0.5">{formatBs(kpis.saldoRef, rate?.eur)}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 md:p-5 border border-stone-200">
            <div className="text-xs text-stone-500 mb-1">Eventos pendientes</div>
            <div className="text-2xl md:text-3xl font-bold text-stone-700">{kpis.pendingCount}</div>
            <div className="text-sm text-stone-500 mt-0.5">sin saldar</div>
          </div>
          <div className="bg-white rounded-2xl p-4 md:p-5 border border-stone-200">
            <div className="text-xs text-stone-500 mb-1">Saldado este mes</div>
            <div className="text-2xl md:text-3xl font-bold text-gold">
              {formatREF(kpis.settledMonthRef)}
            </div>
            <div className="text-sm text-stone-500 mt-0.5">{transfersThisMonth.length} transferencia(s)</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-3 border border-stone-200 flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <Calendar size={14} /> Mes
          </div>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white capitalize"
          >
            {monthOptions.map((m) => (
              <option key={m.key} value={m.key} className="capitalize">{m.label}</option>
            ))}
          </select>
          <span className="text-xs text-stone-400 mx-1">|</span>
          <span className="text-xs text-stone-500">Estado</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="pending">Pendientes</option>
            <option value="settled">Saldados</option>
            <option value="all">Todos</option>
          </select>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-stone-400 text-sm animate-pulse">Cargando...</div>
          ) : filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-stone-400 text-sm">Sin eventos en este filtro</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Paquete</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Total REF</th>
                    <th className="text-center px-4 py-2.5 font-semibold">Estado</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((ev) => {
                    const total = eventCostTotal(ev.id);
                    return (
                      <tr key={ev.id} className="border-t border-stone-100 hover:bg-stone-50">
                        <td className="px-4 py-3 text-stone-700">{fmtDate(ev.event_date)}</td>
                        <td className="px-4 py-3 text-stone-700">{clientName(ev.client_id)}</td>
                        <td className="px-4 py-3 text-stone-600 capitalize">{packageName(ev.package_id)}</td>
                        <td className="px-4 py-3 text-right font-medium text-stone-800">{formatREF(total)}</td>
                        <td className="px-4 py-3 text-center">
                          {ev.is_settled ? (
                            <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                              Saldado
                            </span>
                          ) : (
                            <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedEvent(ev)}
                            className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium"
                          >
                            <Eye size={14} /> Ver
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
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          items={itemsByEvent[selectedEvent.id] || []}
          productsById={productsById}
          clientName={clientName(selectedEvent.client_id)}
          packageName={packageName(selectedEvent.package_id)}
          rate={rate}
          onClose={() => setSelectedEvent(null)}
          onMarkSettled={() => {
            setSettlingEvent(selectedEvent);
            setSelectedEvent(null);
          }}
        />
      )}

      {settlingEvent && (
        <SettleEventModal
          event={settlingEvent}
          totalRef={eventCostTotal(settlingEvent.id)}
          rate={rate}
          user={user}
          onClose={() => setSettlingEvent(null)}
          onSettled={async () => {
            setSettlingEvent(null);
            await loadAll();
          }}
        />
      )}
    </div>
  );
}
