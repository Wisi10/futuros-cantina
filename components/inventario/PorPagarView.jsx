"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronRight, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import SupplierProfileModal from "./SupplierProfileModal";
import SupplierPaymentModal from "./SupplierPaymentModal";

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
  const [openSupplier, setOpenSupplier] = useState(null); // proveedor cuyo modal de detalle está abierto
  const [payingRestocks, setPayingRestocks] = useState(null); // array para pago combinado

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

  const openGroup = openSupplier ? grouped.find((g) => g.supplier === openSupplier) : null;

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

      {/* Lista grid 2 columnas en md+; 1 columna en mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {grouped.map((g) => (
          <button
            key={g.supplier}
            onClick={() => setOpenSupplier(g.supplier)}
            className="bg-white rounded-xl border border-stone-200 hover:border-brand hover:shadow-sm transition-all px-4 py-3 flex items-center justify-between gap-3 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-stone-800 truncate">{g.supplier}</div>
              <div className="text-xs text-stone-500 mt-0.5">
                {g.items.length} factura{g.items.length !== 1 ? "s" : ""}
                {g.hasOverdue && (
                  <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-medium">
                    <AlertTriangle size={11} /> con vencidos
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-brand">${g.totalPending.toFixed(2)}</div>
              {usdRate && (
                <div className="text-[11px] text-stone-500">
                  Bs {(g.totalPending * usdRate).toLocaleString("es-VE", { maximumFractionDigits: 0 })}
                </div>
              )}
            </div>
            <ChevronRight size={16} className="text-stone-300 shrink-0" />
          </button>
        ))}
      </div>

      {/* Modal de perfil completo del proveedor */}
      {openGroup && (
        <SupplierProfileModal
          supplierId={openGroup.items[0]?.supplier_id || null}
          supplierName={openGroup.supplier}
          pendingRestocks={openGroup.items}
          paymentsByRestock={payments}
          usdRate={usdRate}
          user={user}
          onClose={() => setOpenSupplier(null)}
          onPay={() => setPayingRestocks(openGroup.items)}
          onChanged={() => load()}
        />
      )}

      {/* Modal de pago simplificado (sin edición por factura) */}
      {payingRestocks && payingRestocks.length > 0 && openGroup && (
        <SupplierPaymentModal
          supplier={openGroup.supplier}
          restocks={payingRestocks}
          rate={rate}
          user={user}
          onClose={() => setPayingRestocks(null)}
          onPaid={() => {
            setPayingRestocks(null);
            setOpenSupplier(null);
            load();
          }}
        />
      )}
    </div>
  );
}

