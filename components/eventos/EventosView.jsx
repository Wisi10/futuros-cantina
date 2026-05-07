"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs } from "@/lib/utils";
import EventDetailModal from "./EventDetailModal";
import RegisterIntercompanyPaymentModal from "./RegisterIntercompanyPaymentModal";

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

export default function EventosView({ user, rate }) {
  const [monthFilter, setMonthFilter] = useState(currentMonthKey());
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [itemsByEvent, setItemsByEvent] = useState({});
  const [productsById, setProductsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [paymentModalEvent, setPaymentModalEvent] = useState(null);

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
          .select("id, name, cost_ref, is_cantina")
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

  const filteredDebtRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "pending") return rows.filter((r) => r.intercompany_status === "pending");
    if (statusFilter === "partial") return rows.filter((r) => r.intercompany_status === "partial");
    if (statusFilter === "settled") return rows.filter((r) => r.intercompany_status === "settled");
    return rows;
  }, [rows, statusFilter]);

  const sectionOneRows = rows;

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
                {sectionOneRows.map((r) => (
                  <div key={r.event_id} className="border border-stone-200 rounded-xl p-3 bg-stone-50/40">
                    <div className="flex items-start justify-between mb-1">
                      <div className="text-xs text-stone-500">{fmtDate(r.event_date)}</div>
                      <ComboStatusBadge status={r.combo_payment_status} />
                    </div>
                    <div className="font-semibold text-sm text-stone-800 truncate">{r.client_name}</div>
                    <div className="text-xs text-stone-500 capitalize truncate">{r.package_name || "—"}</div>
                    <div className="mt-2 text-base font-bold text-brand">{formatREF(r.combo_total_ref)}</div>
                    <div className="text-[11px] text-stone-500">Pagado: {formatREF(r.combo_paid_ref)}</div>
                  </div>
                ))}
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
            <span className="text-xs text-stone-500">Estado</span>
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
          }}
          items={itemsByEvent[selectedEvent.event_id] || []}
          productsById={productsById}
          clientName={selectedEvent.client_name}
          packageName={selectedEvent.package_name || ""}
          rate={rate}
          canRegisterPayment={isAdmin}
          onClose={() => setSelectedEvent(null)}
          onRegisterPayment={() => {
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
    </div>
  );
}
