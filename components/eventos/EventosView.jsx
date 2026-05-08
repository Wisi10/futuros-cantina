"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs } from "@/lib/utils";
import EventDetailModal from "./EventDetailModal";
import RegisterIntercompanyPaymentModal from "./RegisterIntercompanyPaymentModal";
import MarkEventConsumedModal from "./MarkEventConsumedModal";

const MONTH_LABELS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthFirstDay(monthKey) {
  return `${monthKey}-01`;
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

const MONTH_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function todayCaracas() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
}

function daysBetween(isoFrom, isoTo) {
  const a = new Date(isoFrom + "T12:00:00").getTime();
  const b = new Date(isoTo + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

function DateBlock({ iso, accent = "text-gold" }) {
  if (!iso) return <div className="text-xs text-stone-400">—</div>;
  const [y, m, d] = iso.slice(0, 10).split("-");
  const monthIdx = parseInt(m, 10) - 1;
  return (
    <div className="flex flex-col items-center justify-center bg-white border border-stone-200 rounded-lg px-2 py-1 shrink-0 w-14">
      <div className="text-2xl font-bold leading-none text-stone-800">{d}</div>
      <div className={`text-[10px] font-bold tracking-wider mt-0.5 ${accent}`}>
        {MONTH_SHORT[monthIdx] || ""}
      </div>
      <div className="text-[9px] text-stone-400 leading-none mt-0.5">{y}</div>
    </div>
  );
}

function HoyManianaBadge({ iso }) {
  if (!iso) return null;
  const today = todayCaracas();
  const delta = daysBetween(today, iso.slice(0, 10));
  if (delta === 0) {
    return <span className="inline-block bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Hoy</span>;
  }
  if (delta === 1) {
    return <span className="inline-block bg-orange-100 text-orange-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Maniana</span>;
  }
  return null;
}

function isThisWeek(iso) {
  if (!iso) return false;
  const delta = daysBetween(todayCaracas(), iso.slice(0, 10));
  return delta >= 0 && delta <= 7;
}

function ComboStatusBadge({ status }) {
  if (status === "paid") {
    return <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">Pagado</span>;
  }
  if (status === "partial") {
    return <span className="inline-block bg-violet-100 text-violet-800 text-xs font-semibold px-2 py-0.5 rounded-full">Parcial</span>;
  }
  return <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">Pendiente</span>;
}

function IntercompanyStatusBadge({ status }) {
  if (status === "settled") {
    return <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">Saldado</span>;
  }
  if (status === "partial") {
    return <span className="inline-block bg-violet-100 text-violet-800 text-xs font-semibold px-2 py-0.5 rounded-full">Parcial</span>;
  }
  return <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">Pendiente</span>;
}

export default function EventosView({ user, rate, onNavigate }) {
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [statusFilter, setStatusFilter] = useState("pending");
  const [consumptionFilter, setConsumptionFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [itemsByEvent, setItemsByEvent] = useState({});
  const [productsById, setProductsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [paymentModalEvent, setPaymentModalEvent] = useState(null);
  const [consumeModalEvent, setConsumeModalEvent] = useState(null);

  const monthOptions = useMemo(buildMonthOptions, []);
  const isAdmin = user?.cantinaRole === "admin";

  const loadAll = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const monthStart = monthFirstDay(monthFilter);

    const [{ data: rowsData }, { data: sumData }] = await Promise.all([
      supabase.rpc("get_events_with_combo_totals", { p_month_start: monthStart }),
      supabase.rpc("get_intercompany_summary", { p_month_start: monthStart }),
    ]);
    const eventRows = rowsData || [];
    setRows(eventRows);
    setSummary(Array.isArray(sumData) ? sumData[0] : sumData);

    const eventIds = eventRows.map((e) => e.event_id);
    if (eventIds.length) {
      const { data: items } = await supabase
        .from("event_items")
        .select("*")
        .in("event_id", eventIds);
      const itemList = items || [];
      const productIds = [...new Set(itemList.map((i) => i.product_id).filter(Boolean))];
      let products = [];
      if (productIds.length) {
        const { data } = await supabase
          .from("products")
          .select("id, name, cost_ref, is_cantina, stock_quantity")
          .in("id", productIds);
        products = data || [];
      }
      const itemsMap = {};
      itemList.forEach((it) => {
        if (!itemsMap[it.event_id]) itemsMap[it.event_id] = [];
        itemsMap[it.event_id].push(it);
      });
      const prodMap = {};
      products.forEach((p) => { prodMap[p.id] = p; });
      setItemsByEvent(itemsMap);
      setProductsById(prodMap);
    } else {
      setItemsByEvent({});
      setProductsById({});
    }

    setLoading(false);
  }, [monthFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Ensure ASC by event_date for both sections (RPC already returns ASC,
  // but enforce client-side for safety).
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.event_date || "").localeCompare(b.event_date || "")),
    [rows]
  );

  const today = todayCaracas();

  const matchesConsumption = (r) => {
    if (consumptionFilter === "all") return true;
    if (consumptionFilter === "consumed") return r.is_consumed === true;
    if (consumptionFilter === "pending_consume") return !r.is_consumed && (r.event_date || "") <= today;
    if (consumptionFilter === "upcoming") return (r.event_date || "") > today;
    return true;
  };

  const filteredDebtRows = useMemo(() => {
    let base = sortedRows;
    if (statusFilter !== "all") base = base.filter((r) => r.intercompany_status === statusFilter);
    return base.filter(matchesConsumption);
  }, [sortedRows, statusFilter, consumptionFilter, today]);

  const sectionOneRows = sortedRows;

  return (
    <div className="h-full overflow-y-auto bg-brand-cream-light">
      <div className="max-w-7xl mx-auto p-3 md:p-6 space-y-5 md:space-y-6">
        {/* ─── Seccion 1: Vision complejo (combo a cliente) ─── */}
        <section>
          <div className="flex items-baseline justify-between mb-2 px-1">
            <div>
              <h2 className="text-base md:text-lg font-bold text-stone-800">Eventos del mes</h2>
              <p className="text-xs text-stone-500">Combo cobrado al cliente por el complejo (lectura)</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-stone-400 text-sm animate-pulse">Cargando...</div>
            ) : sectionOneRows.length === 0 ? (
              <div className="p-6 text-center text-stone-400 text-sm">Sin eventos este mes</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
                {sectionOneRows.map((r) => {
                  const accent = isThisWeek(r.event_date) ? "border-l-4 border-l-gold" : "";
                  const pendingConsume = !r.is_consumed && (r.event_date || "") < today;
                  return (
                    <div key={r.event_id} className={`border border-stone-200 rounded-xl p-3 bg-stone-50/40 ${accent}`}>
                      <div className="flex items-start gap-3">
                        <DateBlock iso={r.event_date} accent="text-gold" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex flex-wrap gap-1 items-center">
                              <HoyManianaBadge iso={r.event_date} />
                              {pendingConsume && (
                                <span className="inline-block bg-red-100 text-red-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  Pendiente consumir
                                </span>
                              )}
                              <ComboStatusBadge status={r.combo_payment_status} />
                            </div>
                          </div>
                          <div className="font-semibold text-sm text-stone-800 truncate">
                            {r.client_name} <span className="text-stone-400 font-normal">·</span> <span className="text-stone-600 capitalize font-normal">{r.package_name || "—"}</span>
                          </div>
                          <div className="mt-1 text-sm text-stone-700">
                            <span className="font-bold text-brand">{formatREF(r.combo_total_ref)}</span>
                            <span className="text-stone-400 mx-1">·</span>
                            <span className="text-xs text-stone-500">Pagado {formatREF(r.combo_paid_ref)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ─── Seccion 2: Deuda intercompania (complejo a cantina) ─── */}
        <section>
          <div className="flex items-baseline justify-between mb-2 px-1">
            <div>
              <h2 className="text-base md:text-lg font-bold text-stone-800">Deuda intercompania</h2>
              <p className="text-xs text-stone-500">Lo que el complejo debe a la cantina por insumos</p>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="md:col-span-1 bg-white rounded-2xl p-4 md:p-5 border border-stone-200">
              <div className="text-xs text-stone-500 mb-1">Saldo a favor de cantina</div>
              <div className="text-2xl md:text-3xl font-bold text-brand">
                {formatREF(summary?.saldo_a_favor_ref || 0)}
              </div>
              <div className="text-sm text-stone-500 mt-0.5">{formatBs(summary?.saldo_a_favor_ref || 0, rate?.eur)}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-5 border border-stone-200">
              <div className="text-xs text-stone-500 mb-1">Eventos pendientes</div>
              <div className="text-2xl md:text-3xl font-bold text-stone-700">{summary?.pending_count || 0}</div>
              <div className="text-sm text-stone-500 mt-0.5">sin saldar</div>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-5 border border-stone-200">
              <div className="text-xs text-stone-500 mb-1">Saldado este mes</div>
              <div className="text-2xl md:text-3xl font-bold text-gold">
                {formatREF(summary?.settled_month_ref || 0)}
              </div>
              <div className="text-sm text-stone-500 mt-0.5">{summary?.transfers_month_count || 0} transferencia(s)</div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl p-3 border border-stone-200 flex gap-2 flex-wrap items-center mb-3">
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
            <span className="text-xs text-stone-500">Pago</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="pending">Pendientes</option>
              <option value="partial">Parciales</option>
              <option value="settled">Saldados</option>
              <option value="all">Todos</option>
            </select>
            <span className="text-xs text-stone-400 mx-1">|</span>
            <span className="text-xs text-stone-500">Consumo</span>
            <select
              value={consumptionFilter}
              onChange={(e) => setConsumptionFilter(e.target.value)}
              className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="all">Todos</option>
              <option value="pending_consume">Pendiente consumir</option>
              <option value="upcoming">Proximos</option>
              <option value="consumed">Consumidos</option>
            </select>
          </div>

          {/* List */}
          <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-stone-400 text-sm animate-pulse">Cargando...</div>
            ) : filteredDebtRows.length === 0 ? (
              <div className="p-8 text-center text-stone-400 text-sm">Sin eventos en este filtro</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-stone-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold">Fecha</th>
                      <th className="text-left px-4 py-2.5 font-semibold">Cliente</th>
                      <th className="text-left px-4 py-2.5 font-semibold">Paquete</th>
                      <th className="text-right px-4 py-2.5 font-semibold">Costo REF</th>
                      <th className="text-right px-4 py-2.5 font-semibold">Pagado REF</th>
                      <th className="text-center px-4 py-2.5 font-semibold">Estado</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDebtRows.map((r) => (
                      <tr key={r.event_id} className="border-t border-stone-100 hover:bg-stone-50">
                        <td className="px-4 py-3 text-stone-700">{fmtDate(r.event_date)}</td>
                        <td className="px-4 py-3 text-stone-700">{r.client_name}</td>
                        <td className="px-4 py-3 text-stone-600 capitalize">{r.package_name || "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-stone-800">{formatREF(r.intercompany_owed_ref)}</td>
                        <td className="px-4 py-3 text-right text-stone-600">{formatREF(r.intercompany_paid_ref)}</td>
                        <td className="px-4 py-3 text-center">
                          <IntercompanyStatusBadge status={r.intercompany_status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedEvent(r)}
                            className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium"
                          >
                            <Eye size={14} /> Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={{
            id: selectedEvent.event_id,
            event_date: selectedEvent.event_date,
            is_settled: selectedEvent.is_settled,
            settled_at: null,
            is_consumed: selectedEvent.is_consumed,
            consumed_at: selectedEvent.consumed_at,
            consumed_by: selectedEvent.consumed_by,
            _user_name: user?.name || "Cantina",
          }}
          items={itemsByEvent[selectedEvent.event_id] || []}
          productsById={productsById}
          clientName={selectedEvent.client_name}
          packageName={selectedEvent.package_name || ""}
          rate={rate}
          canRegisterPayment={isAdmin}
          isAdmin={isAdmin}
          onNavigateToInventario={onNavigate ? () => onNavigate("inventario") : undefined}
          onClose={() => setSelectedEvent(null)}
          onMarkConsumed={() => {
            setConsumeModalEvent(selectedEvent);
            setSelectedEvent(null);
          }}
          onReverted={async () => {
            setSelectedEvent(null);
            await loadAll();
          }}
          onRegisterPayment={async ({ owedRef }) => {
            const isCloseOut = !owedRef || owedRef <= 0;
            if (isCloseOut) {
              const ok = window.confirm(
                "Este evento no tiene insumos de cantina. Cerrar y marcar como saldado?"
              );
              if (!ok) return;
              const { data, error } = await supabase.rpc("register_event_payment", {
                p_event_id: selectedEvent.event_id,
                p_amount_ref: 0,
                p_payment_method: "transferencia",
                p_exchange_rate: rate?.eur || null,
                p_created_by: user?.name || "Cantina",
                p_notes: "Close-out evento sin deuda",
              });
              if (error) {
                alert("Error: " + error.message);
                return;
              }
              const result = Array.isArray(data) ? data[0] : data;
              if (!result?.success) {
                alert("Error: " + (result?.message || "no se pudo cerrar"));
                return;
              }
              setSelectedEvent(null);
              await loadAll();
              return;
            }
            setPaymentModalEvent(selectedEvent);
            setSelectedEvent(null);
          }}
        />
      )}

      {paymentModalEvent && (
        <RegisterIntercompanyPaymentModal
          event={{ id: paymentModalEvent.event_id }}
          owedRef={Number(paymentModalEvent.intercompany_owed_ref || 0)}
          paidRef={Number(paymentModalEvent.intercompany_paid_ref || 0)}
          rate={rate}
          user={user}
          onClose={() => setPaymentModalEvent(null)}
          onRegistered={async () => {
            setPaymentModalEvent(null);
            await loadAll();
          }}
        />
      )}

      {consumeModalEvent && (
        <MarkEventConsumedModal
          event={{ id: consumeModalEvent.event_id }}
          items={itemsByEvent[consumeModalEvent.event_id] || []}
          productsById={productsById}
          user={user}
          onClose={() => setConsumeModalEvent(null)}
          onConfirmed={async () => {
            setConsumeModalEvent(null);
            await loadAll();
          }}
        />
      )}
    </div>
  );
}
