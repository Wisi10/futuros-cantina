"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X, AlertTriangle, Calendar, ChevronDown, ChevronRight, DollarSign,
  ShoppingCart, History, Package, Phone, FileText, Loader2, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

function daysUntil(dueDate) {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

function fmtShort(iso) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1].slice(2)}`;
}

function daysSince(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate.length > 10 ? isoDate : isoDate + "T00:00:00");
  const diff = (Date.now() - d.getTime()) / 86400000;
  if (diff < 1) return "hoy";
  if (diff < 2) return "ayer";
  if (diff < 30) return `hace ${Math.floor(diff)}d`;
  if (diff < 365) return `hace ${Math.floor(diff / 30)}m`;
  return `hace ${Math.floor(diff / 365)}a`;
}

// Perfil completo del proveedor: resumen financiero + indicadores + secciones expandibles.
// Reemplaza al antiguo SupplierDebtModal con info más amplia.
export default function SupplierProfileModal({ supplierId, supplierName, pendingRestocks, paymentsByRestock: paymentsPendingMap, usdRate, onClose, onPay }) {
  const [supplier, setSupplier] = useState(null);
  const [allRestocks, setAllRestocks] = useState(null); // todos: pending/partial/paid
  const [allPayments, setAllPayments] = useState(null); // pagos a TODOS los restocks del proveedor
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({ pending: true });

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // Supplier record (datos de contacto, notas, método default)
      const supPromise = supplierId
        ? supabase.from("suppliers").select("*").eq("id", supplierId).maybeSingle()
        : Promise.resolve({ data: null });

      // Todos los restocks del proveedor (cualquier status)
      let restockQuery = supabase.from("cantina_restocks").select("*").order("restock_date", { ascending: false });
      if (supplierId) restockQuery = restockQuery.eq("supplier_id", supplierId);
      else restockQuery = restockQuery.eq("supplier", supplierName);

      const [supRes, restockRes] = await Promise.all([supPromise, restockQuery]);
      const restocks = restockRes.data || [];
      setSupplier(supRes.data || null);
      setAllRestocks(restocks);

      // Pagos a esos restocks
      if (restocks.length > 0) {
        const ids = restocks.map((r) => r.id);
        const { data: pays } = await supabase
          .from("cantina_restock_payments")
          .select("*")
          .in("restock_id", ids)
          .order("paid_at", { ascending: false });
        setAllPayments(pays || []);
      } else {
        setAllPayments([]);
      }
    } catch (e) {
      console.error("SupplierProfileModal load:", e);
    } finally {
      setLoading(false);
    }
  }, [supplierId, supplierName]);

  useEffect(() => { load(); }, [load]);

  // ─── KPIs ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!allRestocks) return null;
    const currentDebt = pendingRestocks.reduce(
      (s, r) => s + Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0)), 0
    );
    const totalSpent = allRestocks.reduce((s, r) => s + Number(r.total_cost_ref || 0), 0);
    const totalPaid = allRestocks.reduce((s, r) => s + Number(r.paid_amount_ref || 0), 0);

    // Promedio por mes — basado en rango de fechas de restocks
    const dates = allRestocks.map((r) => r.restock_date).filter(Boolean).sort();
    let avgPerMonth = 0;
    if (dates.length > 0) {
      const first = new Date(dates[0] + "T00:00:00");
      const last = new Date(dates[dates.length - 1] + "T00:00:00");
      const months = Math.max(1, (last - first) / (1000 * 60 * 60 * 24 * 30));
      avgPerMonth = totalSpent / months;
    }

    // Mora promedio — solo facturas vencidas
    const overdueDays = pendingRestocks
      .map((r) => r.due_date ? -daysUntil(r.due_date) : null)
      .filter((d) => d != null && d > 0);
    const avgMora = overdueDays.length > 0
      ? overdueDays.reduce((a, b) => a + b, 0) / overdueDays.length
      : 0;

    // Última compra y último pago
    const lastPurchase = allRestocks[0]?.restock_date || null;
    const lastPayment = (allPayments || [])[0]?.paid_at || null;

    return {
      currentDebt, totalSpent, totalPaid, avgPerMonth, avgMora,
      lastPurchase, lastPayment,
      totalRestocks: allRestocks.length,
      totalPayments: (allPayments || []).length,
    };
  }, [allRestocks, allPayments, pendingRestocks]);

  // Top productos comprados (por monto total acumulado)
  const topProducts = useMemo(() => {
    if (!allRestocks) return [];
    const tally = {};
    for (const r of allRestocks) {
      const items = Array.isArray(r.items) ? r.items : [];
      for (const it of items) {
        if (!it?.product_id) continue;
        if (!tally[it.product_id]) {
          tally[it.product_id] = { name: it.name || "?", units: 0, spent: 0 };
        }
        tally[it.product_id].units += Number(it.qty || 0);
        tally[it.product_id].spent += Number(it.total_cost_ref || 0);
      }
    }
    return Object.values(tally).sort((a, b) => b.spent - a.spent).slice(0, 5);
  }, [allRestocks]);

  const sortedPending = useMemo(() => {
    return [...pendingRestocks].sort((a, b) => {
      const aDue = a.due_date ? daysUntil(a.due_date) : 999;
      const bDue = b.due_date ? daysUntil(b.due_date) : 999;
      if (aDue !== bDue) return aDue - bDue;
      return (a.restock_date || "").localeCompare(b.restock_date || "");
    });
  }, [pendingRestocks]);

  const sortedPurchases = useMemo(() => allRestocks ? [...allRestocks].slice(0, 30) : [], [allRestocks]);
  const sortedPayments = useMemo(() => allPayments ? [...allPayments].slice(0, 30) : [], [allPayments]);

  const toggle = (k) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div className="min-w-0">
            <div className="text-xs text-stone-500 mb-1">Proveedor</div>
            <div className="text-lg font-bold text-stone-800 truncate">{supplierName}</div>
            <div className="text-xs text-stone-500 mt-0.5">
              {pendingRestocks.length} factura{pendingRestocks.length !== 1 ? "s" : ""} pendiente{pendingRestocks.length !== 1 ? "s" : ""}
              {stats && stats.totalRestocks > pendingRestocks.length && (
                <span> · {stats.totalRestocks} compras totales</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body scrolleable */}
        <div className="flex-1 overflow-y-auto">
          {loading || !stats ? (
            <div className="flex items-center justify-center py-12 text-stone-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Cargando perfil...
            </div>
          ) : (
            <>
              {/* Resumen financiero */}
              <div className="px-5 py-3 bg-stone-50 border-b border-stone-200 grid grid-cols-4 gap-2 text-center">
                <Kpi label="Deuda actual" value={`$${stats.currentDebt.toFixed(2)}`} valueClass="text-brand" bs={stats.currentDebt * (usdRate || 0)} usdRate={usdRate} highlight />
                <Kpi label="Comprado total" value={`$${stats.totalSpent.toFixed(2)}`} bs={stats.totalSpent * (usdRate || 0)} usdRate={usdRate} />
                <Kpi label="Pagado total" value={`$${stats.totalPaid.toFixed(2)}`} valueClass="text-green-700" bs={stats.totalPaid * (usdRate || 0)} usdRate={usdRate} />
                <Kpi label="Promedio/mes" value={`$${stats.avgPerMonth.toFixed(0)}`} bs={stats.avgPerMonth * (usdRate || 0)} usdRate={usdRate} />
              </div>

              {/* Indicadores */}
              <div className="px-5 py-3 border-b border-stone-200 grid grid-cols-3 gap-2 text-center">
                <Indicator
                  label="Mora promedio"
                  value={stats.avgMora > 0 ? `${Math.round(stats.avgMora)} días` : "0 días"}
                  valueClass={stats.avgMora > 0 ? "text-red-600" : "text-green-700"}
                />
                <Indicator
                  label="Última compra"
                  value={daysSince(stats.lastPurchase) || "—"}
                />
                <Indicator
                  label="Último pago"
                  value={daysSince(stats.lastPayment) || "—"}
                />
              </div>

              {/* Sección: Cuentas por pagar */}
              <Section
                icon={<AlertTriangle size={14} className="text-brand" />}
                title={`Cuentas por pagar (${pendingRestocks.length})`}
                amount={`$${stats.currentDebt.toFixed(2)}`}
                open={expanded.pending}
                onToggle={() => toggle("pending")}
              >
                <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100 m-3">
                  {sortedPending.map((r) => {
                    const owed = Math.max(0, Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0));
                    const overdueDays = r.due_date ? -daysUntil(r.due_date) : null;
                    const isOverdue = overdueDays != null && overdueDays > 0;
                    const isPartial = r.payment_status === "partial";
                    const itemsLabel = Array.isArray(r.items) && r.items.length > 0
                      ? r.items.map((it) => `${it.name || "?"}×${it.qty || 0}`).join(", ")
                      : "";
                    return (
                      <div key={r.id} className={`px-3 py-2 flex items-center gap-2 ${isOverdue ? "bg-red-50/40" : "bg-white"}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                            <span className="text-stone-700 font-semibold tabular-nums">{fmtShort(r.restock_date)}</span>
                            {r.due_date && (
                              <span className={`inline-flex items-center gap-0.5 ${isOverdue ? "text-red-600 font-bold" : "text-stone-400"}`}>
                                <Calendar size={9} />
                                {fmtShort(r.due_date)}
                                {isOverdue && <span className="ml-0.5">· {overdueDays}d</span>}
                              </span>
                            )}
                            {isPartial && (
                              <span className="px-1 py-0 bg-violet-100 text-violet-700 rounded text-[9px] uppercase tracking-wider font-bold">Parcial</span>
                            )}
                          </div>
                          {itemsLabel && (
                            <div className="text-[11px] text-stone-600 truncate mt-0.5" title={itemsLabel}>{itemsLabel}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-stone-800 text-sm tabular-nums">${owed.toFixed(2)}</div>
                          {usdRate && (
                            <div className="text-[10px] text-stone-400 tabular-nums">Bs {(owed * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>

              {/* Sección: Compras (todas) */}
              <Section
                icon={<ShoppingCart size={14} className="text-stone-500" />}
                title={`Compras (${stats.totalRestocks})`}
                amount={`$${stats.totalSpent.toFixed(2)}`}
                open={expanded.purchases}
                onToggle={() => toggle("purchases")}
              >
                {sortedPurchases.length === 0 ? (
                  <div className="px-5 py-3 text-xs text-stone-400 text-center">Sin compras registradas</div>
                ) : (
                  <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100 m-3">
                    {sortedPurchases.map((r) => {
                      const itemsLabel = Array.isArray(r.items) && r.items.length > 0
                        ? r.items.map((it) => `${it.name || "?"}×${it.qty || 0}`).join(", ")
                        : "";
                      const isPaid = r.payment_status === "paid";
                      const isPartial = r.payment_status === "partial";
                      return (
                        <div key={r.id} className="px-3 py-2 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-stone-700 font-semibold tabular-nums">{fmtShort(r.restock_date)}</span>
                              {isPaid && <span className="px-1 bg-green-100 text-green-700 rounded text-[9px] uppercase tracking-wider font-bold">Pagada</span>}
                              {isPartial && <span className="px-1 bg-violet-100 text-violet-700 rounded text-[9px] uppercase tracking-wider font-bold">Parcial</span>}
                              {r.payment_status === "pending" && <span className="px-1 bg-amber-100 text-amber-700 rounded text-[9px] uppercase tracking-wider font-bold">Pendiente</span>}
                            </div>
                            {itemsLabel && (
                              <div className="text-[11px] text-stone-600 truncate mt-0.5" title={itemsLabel}>{itemsLabel}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-stone-800 text-sm tabular-nums">${Number(r.total_cost_ref || 0).toFixed(2)}</div>
                          </div>
                        </div>
                      );
                    })}
                    {stats.totalRestocks > sortedPurchases.length && (
                      <div className="px-3 py-1.5 text-[11px] text-stone-400 italic text-center">… y {stats.totalRestocks - sortedPurchases.length} compra{stats.totalRestocks - sortedPurchases.length !== 1 ? "s" : ""} más</div>
                    )}
                  </div>
                )}
              </Section>

              {/* Sección: Pagos */}
              <Section
                icon={<History size={14} className="text-green-600" />}
                title={`Pagos (${stats.totalPayments})`}
                amount={`$${stats.totalPaid.toFixed(2)}`}
                open={expanded.payments}
                onToggle={() => toggle("payments")}
              >
                {sortedPayments.length === 0 ? (
                  <div className="px-5 py-3 text-xs text-stone-400 text-center">Sin pagos registrados</div>
                ) : (
                  <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100 m-3">
                    {sortedPayments.map((p) => (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                            <span className="text-stone-700 font-semibold tabular-nums">{fmtShort(p.paid_at)}</span>
                            <span className="text-stone-500 capitalize">{(p.payment_method || "").replace(/_/g, " ")}</span>
                            {p.reference && <span className="text-stone-400">ref {p.reference}</span>}
                          </div>
                          {p.notes && (
                            <div className="text-[11px] text-stone-400 truncate mt-0.5" title={p.notes}>{p.notes}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-green-700 text-sm tabular-nums">${Number(p.amount_ref).toFixed(2)}</div>
                          {p.amount_bs != null && (
                            <div className="text-[10px] text-stone-400 tabular-nums">Bs {Number(p.amount_bs).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Sección: Top productos */}
              {topProducts.length > 0 && (
                <Section
                  icon={<Package size={14} className="text-stone-500" />}
                  title={`Top productos comprados (${topProducts.length})`}
                  open={expanded.top}
                  onToggle={() => toggle("top")}
                >
                  <div className="border border-stone-200 rounded-xl overflow-hidden divide-y divide-stone-100 m-3">
                    {topProducts.map((p, i) => (
                      <div key={i} className="px-3 py-2 flex items-center gap-2">
                        <div className="text-xs text-stone-400 font-bold w-5 tabular-nums">#{i + 1}</div>
                        <div className="min-w-0 flex-1 text-xs text-stone-700 truncate">{p.name}</div>
                        <div className="text-[11px] text-stone-500 tabular-nums shrink-0">{p.units} u</div>
                        <div className="font-bold text-stone-800 text-xs tabular-nums shrink-0 w-16 text-right">${p.spent.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Sección: Contacto y notas */}
              {supplier && (supplier.contact_phone || supplier.default_payment_method || supplier.notes) && (
                <Section
                  icon={<Phone size={14} className="text-stone-500" />}
                  title="Contacto y notas"
                  open={expanded.contact}
                  onToggle={() => toggle("contact")}
                >
                  <div className="m-3 border border-stone-200 rounded-xl p-3 space-y-1.5 text-xs">
                    {supplier.contact_phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={11} className="text-stone-400" />
                        <span className="text-stone-700">{supplier.contact_phone}</span>
                      </div>
                    )}
                    {supplier.default_payment_method && (
                      <div className="flex items-center gap-2">
                        <DollarSign size={11} className="text-stone-400" />
                        <span className="text-stone-500">Método habitual:</span>
                        <span className="text-stone-700 capitalize">{supplier.default_payment_method.replace(/_/g, " ")}</span>
                      </div>
                    )}
                    {supplier.notes && (
                      <div className="flex items-start gap-2 pt-1 border-t border-stone-100">
                        <FileText size={11} className="text-stone-400 mt-0.5 shrink-0" />
                        <span className="text-stone-600 whitespace-pre-wrap">{supplier.notes}</span>
                      </div>
                    )}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">
            Cerrar
          </button>
          <button
            onClick={onPay}
            disabled={!stats || stats.currentDebt <= 0}
            className="px-4 py-2.5 bg-brand text-white hover:bg-brand-dark rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DollarSign size={14} />
            {stats?.currentDebt > 0 ? `Registrar pago $${stats.currentDebt.toFixed(2)}` : "Sin deuda pendiente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, valueClass, bs, usdRate, highlight }) {
  return (
    <div className={highlight ? "border-r border-stone-200 last:border-r-0" : "border-r border-stone-200 last:border-r-0"}>
      <div className="text-[9px] uppercase tracking-wider text-stone-500 font-semibold">{label}</div>
      <div className={`text-sm font-bold mt-0.5 tabular-nums ${valueClass || "text-stone-700"}`}>{value}</div>
      {usdRate > 0 && bs > 0 && (
        <div className="text-[10px] text-stone-400 tabular-nums">Bs {bs.toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>
      )}
    </div>
  );
}

function Indicator({ label, value, valueClass }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-stone-500 font-semibold">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${valueClass || "text-stone-700"}`}>{value}</div>
    </div>
  );
}

function Section({ icon, title, amount, open, onToggle, children }) {
  return (
    <div className="border-b border-stone-200 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center gap-2 hover:bg-stone-50 transition-colors text-left"
      >
        {open ? <ChevronDown size={14} className="text-stone-400 shrink-0" /> : <ChevronRight size={14} className="text-stone-400 shrink-0" />}
        <div className="shrink-0">{icon}</div>
        <div className="flex-1 text-xs font-semibold uppercase tracking-wider text-stone-600">{title}</div>
        {amount && <div className="text-xs font-bold text-stone-700 tabular-nums shrink-0">{amount}</div>}
      </button>
      {open && children}
    </div>
  );
}
