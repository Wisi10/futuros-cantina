"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, Loader2, DollarSign, Calendar, CheckCircle2, History } from "lucide-react";
import { supabase } from "@/lib/supabase";
import RestockPaymentModal from "./RestockPaymentModal";

// Vista "Por Pagar" — lista todos los restocks con payment_status pending o partial.
// Agrupa por proveedor con expand/collapse. Highlight rojo si due_date < hoy.

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date(todayISO() + "T00:00:00");
  return Math.floor((target - today) / (1000 * 60 * 60 * 24));
}

export default function PorPagarView({ user, rate }) {
  const [restocks, setRestocks] = useState([]);
  const [payments, setPayments] = useState({}); // { restock_id: [payments...] }
  const [loading, setLoading] = useState(true);
  const [expandedSuppliers, setExpandedSuppliers] = useState(new Set());
  const [payingRestock, setPayingRestock] = useState(null);
  const [payingRestocks, setPayingRestocks] = useState(null); // array para pago combinado
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [historyOpen, setHistoryOpen] = useState(null); // restock_id

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    // 1. Restocks con saldo pendiente
    const { data: rs, error: rsErr } = await supabase
      .from("cantina_restocks")
      .select("*")
      .in("payment_status", ["pending", "partial"])
      .order("restock_date", { ascending: true });
    if (rsErr) {
      console.error("PorPagarView load:", rsErr);
      setLoading(false);
      return;
    }
    setRestocks(rs || []);

    // 2. Pagos parciales hechos a estos restocks (para mostrar historial)
    if (rs && rs.length > 0) {
      const ids = rs.map((r) => r.id);
      const { data: pays } = await supabase
        .from("cantina_restock_payments")
        .select("*")
        .in("restock_id", ids)
        .order("paid_at", { ascending: false });
      const byRestock = {};
      (pays || []).forEach((p) => {
        if (!byRestock[p.restock_id]) byRestock[p.restock_id] = [];
        byRestock[p.restock_id].push(p);
      });
      setPayments(byRestock);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Agrupar por proveedor
  const grouped = useMemo(() => {
    const map = {};
    for (const r of restocks) {
      const key = (r.supplier || "Sin proveedor").trim();
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    const arr = Object.entries(map).map(([supplier, items]) => {
      const totalPending = items.reduce((s, r) => s + (Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0)), 0);
      const hasOverdue = items.some((r) => r.due_date && daysUntil(r.due_date) < 0);
      return { supplier, items, totalPending, hasOverdue };
    });
    arr.sort((a, b) => b.totalPending - a.totalPending);
    return arr;
  }, [restocks]);

  const grandTotal = grouped.reduce((s, g) => s + g.totalPending, 0);
  const usdRate = rate?.usd || rate?.eur || null; // fallback a eur si no hay usd

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-stone-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Cargando cuentas por pagar...
      </div>
    );
  }

  if (restocks.length === 0) {
    return (
      <div className="text-center py-16 text-stone-400">
        <CheckCircle2 size={36} className="mx-auto mb-2 text-green-400" />
        <p className="text-sm">Sin cuentas pendientes con proveedores.</p>
      </div>
    );
  }

  const toggleSupplier = (s) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Total general */}
      <div className="bg-gradient-to-r from-brand to-brand-dark rounded-xl p-4 text-white flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-80">Deuda total a proveedores</div>
          <div className="text-2xl font-bold mt-0.5">${grandTotal.toFixed(2)}</div>
          {usdRate && (
            <div className="text-sm opacity-80 mt-0.5">
              ≈ Bs {(grandTotal * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
              <span className="text-xs ml-2 opacity-70">(tasa de hoy: {Number(usdRate).toFixed(4)})</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider opacity-80">Proveedores</div>
          <div className="text-2xl font-bold mt-0.5">{grouped.length}</div>
          <div className="text-xs opacity-80 mt-0.5">{restocks.length} factura{restocks.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Lista agrupada */}
      <div className="space-y-2">
        {grouped.map((g) => {
          const isOpen = expandedSuppliers.has(g.supplier);
          return (
            <div key={g.supplier} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {/* Header: click para expandir; botón "Pagar a proveedor" siempre visible */}
              <div className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-stone-50 transition-colors">
                <button
                  onClick={() => toggleSupplier(g.supplier)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                  {isOpen ? <ChevronDown size={16} className="text-stone-400 shrink-0" /> : <ChevronRight size={16} className="text-stone-400 shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-medium text-stone-800 truncate">{g.supplier}</div>
                    <div className="text-xs text-stone-500">
                      {g.items.length} factura{g.items.length !== 1 ? "s" : ""}
                      {g.hasOverdue && (
                        <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-medium">
                          <AlertTriangle size={11} /> con vencidos
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="text-right shrink-0">
                  <div className="font-bold text-brand">${g.totalPending.toFixed(2)}</div>
                  {usdRate && (
                    <div className="text-[11px] text-stone-500">
                      Bs {(g.totalPending * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setPayingRestocks(g.items); }}
                  className="px-3 py-2 bg-brand text-white hover:bg-brand-dark rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0"
                  title={`Pagar a ${g.supplier}`}
                >
                  <DollarSign size={12} /> Pagar
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-stone-100 bg-stone-50/40">
                  {g.items.map((r) => (
                    <RestockRow
                      key={r.id}
                      restock={r}
                      payments={payments[r.id] || []}
                      usdRate={usdRate}
                      onToggleHistory={() => setHistoryOpen(historyOpen === r.id ? null : r.id)}
                      historyOpen={historyOpen === r.id}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de pago single */}
      {payingRestock && (
        <RestockPaymentModal
          restock={payingRestock}
          payments={payments[payingRestock.id] || []}
          rate={rate}
          user={user}
          onClose={() => setPayingRestock(null)}
          onPaid={() => {
            setPayingRestock(null);
            load();
          }}
        />
      )}

      {/* Modal de pago multi-factura (mismo proveedor) */}
      {payingRestocks && payingRestocks.length > 0 && (
        <RestockPaymentModal
          restocks={payingRestocks}
          rate={rate}
          user={user}
          onClose={() => setPayingRestocks(null)}
          onPaid={() => {
            setPayingRestocks(null);
            setSelectedIds(new Set());
            load();
          }}
        />
      )}
    </div>
  );
}

function RestockRow({ restock, payments, usdRate, onToggleHistory, historyOpen }) {
  const r = restock;
  const owed = Number(r.total_cost_ref || 0) - Number(r.paid_amount_ref || 0);
  const overdueDays = r.due_date ? -daysUntil(r.due_date) : null; // si dueDate pasada, positivo
  const isOverdue = overdueDays != null && overdueDays > 0;
  const isPartial = r.payment_status === "partial";

  return (
    <div className={`border-b border-stone-100 last:border-b-0 ${isOverdue ? "bg-red-50/40" : ""}`}>
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-stone-500">{r.restock_date}</span>
            {r.notes && <span className="text-xs text-stone-400 truncate max-w-md" title={r.notes}>{r.notes}</span>}
          </div>
          {Array.isArray(r.items) && r.items.length > 0 && (
            <div
              className="text-xs text-stone-600 mt-0.5 line-clamp-2"
              title={r.items.map((it) => `${it.name || "?"} ×${it.qty || 0}`).join(", ")}
            >
              {r.items.map((it) => `${it.name || "?"} ×${it.qty || 0}`).join(", ")}
            </div>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs flex-wrap">
            {r.payment_terms && (
              <span className="text-stone-500">Términos: {r.payment_terms}</span>
            )}
            {r.due_date && (
              <span className={`inline-flex items-center gap-1 ${isOverdue ? "text-red-600 font-bold" : "text-stone-500"}`}>
                <Calendar size={11} />
                Vence: {r.due_date}
                {isOverdue && <> · VENCIDO {overdueDays} día{overdueDays !== 1 ? "s" : ""}</>}
              </span>
            )}
            {isPartial && (
              <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-[10px] uppercase tracking-wider font-bold">
                Parcial · pagado ${Number(r.paid_amount_ref || 0).toFixed(2)}
              </span>
            )}
            {payments.length > 0 && (
              <button onClick={onToggleHistory} className="inline-flex items-center gap-1 text-stone-500 hover:text-brand">
                <History size={11} />
                {payments.length} pago{payments.length !== 1 ? "s" : ""}
                {historyOpen ? " ▲" : " ▼"}
              </button>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-stone-800">${owed.toFixed(2)}</div>
          {usdRate && (
            <div className="text-[11px] text-stone-500">Bs {(owed * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>
          )}
        </div>
      </div>

      {/* Historial de pagos parciales */}
      {historyOpen && payments.length > 0 && (
        <div className="px-4 pb-3 bg-stone-50 border-t border-stone-100">
          <div className="text-xs text-stone-500 uppercase tracking-wider font-medium pt-2 mb-1">Pagos hechos</div>
          <div className="space-y-1">
            {payments.map((p) => (
              <div key={p.id} className="text-xs flex items-center justify-between gap-2 py-1 border-b border-stone-100 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-stone-700 font-medium">{p.paid_at}</span>
                  <span className="text-stone-500">{p.payment_method}</span>
                  {p.reference && <span className="text-stone-400">ref {p.reference}</span>}
                  {p.exchange_rate_bs && <span className="text-stone-400">tasa {Number(p.exchange_rate_bs).toFixed(4)}</span>}
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-700">${Number(p.amount_ref).toFixed(2)}</div>
                  {p.amount_bs != null && (
                    <div className="text-[10px] text-stone-500">Bs {Number(p.amount_bs).toLocaleString("es-VE", { maximumFractionDigits: 0 })}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
