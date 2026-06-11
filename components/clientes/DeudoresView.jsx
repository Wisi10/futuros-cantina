"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2, Search, ShoppingCart, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, PAYMENT_METHODS } from "@/lib/utils";
import { avatarColor, avatarInitials, daysSince, formatVePhone, relativeFromNow } from "@/lib/clientHelpers";
import ClientLink from "@/components/shared/ClientLink";

const FILTERS = [
  { id: "all",      label: "Todos" },
  { id: "vencidos", label: "Vencidos >7d" },
  { id: "al_dia",   label: "Al día <3d" },
];

const SORTS = [
  { id: "debt",    label: "Más deuda" },
  { id: "oldest",  label: "Más antiguo" },
  { id: "name",    label: "Nombre A-Z" },
  { id: "usage",   label: "% límite usado" },
];

const ageColor = (days) => {
  if (days < 3) return "text-green-600";
  if (days <= 7) return "text-yellow-600";
  return "text-red-600";
};
const ageBg = (days) => {
  if (days < 3) return "bg-green-50";
  if (days <= 7) return "bg-yellow-50";
  return "bg-red-50";
};

export default function DeudoresView({ user, rate, onNavigateToVender }) {
  const [debtors, setDebtors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("debt");
  const [expanded, setExpanded] = useState(null);
  // Pay form (FIFO o por crédito puntual)
  const [payTarget, setPayTarget] = useState(null);
  // payTarget: {kind:'group', group} | {kind:'credit', credit, group}
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    // 1. Créditos pendientes (pending + partial)
    const { data: credits } = await supabase
      .from("cantina_credits")
      .select("*")
      .in("status", ["pending", "partial"])
      .order("created_at", { ascending: true });

    if (!credits || credits.length === 0) {
      setDebtors([]);
      setLoading(false);
      return;
    }

    // 2. Agrupar por cliente
    const groups = {};
    credits.forEach((c) => {
      const key = c.client_id || `name:${c.client_name || "?"}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          client_id: c.client_id,
          client_name: c.client_name,
          items: [],
          total: 0,
          oldest_at: c.created_at,
        };
      }
      const outstanding = Number(c.original_amount_ref) - Number(c.paid_amount_ref || 0);
      groups[key].items.push({ ...c, outstanding });
      groups[key].total += outstanding;
      if ((c.created_at || "") < (groups[key].oldest_at || "")) {
        groups[key].oldest_at = c.created_at;
      }
    });
    const groupList = Object.values(groups);

    // 3. Enriquecer con info de clients (límite, vip, teléfono)
    const clientIds = groupList.map((g) => g.client_id).filter(Boolean);
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, first_name, last_name, phone, credit_limit_ref, is_vip")
        .in("id", clientIds);
      const byId = Object.fromEntries((clientRows || []).map((c) => [c.id, c]));
      groupList.forEach((g) => {
        if (g.client_id && byId[g.client_id]) {
          const c = byId[g.client_id];
          g.name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || g.client_name;
          g.phone = c.phone;
          g.credit_limit_ref = Number(c.credit_limit_ref || 0);
          g.is_vip = !!c.is_vip;
        } else {
          g.name = g.client_name;
          g.credit_limit_ref = 0;
        }
      });
    }

    // 4. Último abono por cliente (max created_at en cantina_credit_payments)
    const creditIds = credits.map((c) => c.id);
    if (creditIds.length > 0) {
      const { data: payments } = await supabase
        .from("cantina_credit_payments")
        .select("credit_id, created_at")
        .in("credit_id", creditIds)
        .order("created_at", { ascending: false });
      const lastByCredit = {};
      (payments || []).forEach((p) => {
        if (!lastByCredit[p.credit_id]) lastByCredit[p.credit_id] = p.created_at;
      });
      groupList.forEach((g) => {
        let last = null;
        g.items.forEach((it) => {
          const t = lastByCredit[it.id];
          if (t && (!last || t > last)) last = t;
        });
        g.last_payment_at = last;
      });
    }

    // 5. Items pedidos (de la venta originaria) para cada crédito
    const saleIds = credits.map((c) => c.sale_id).filter(Boolean);
    if (saleIds.length > 0) {
      const { data: sales } = await supabase
        .from("cantina_sales")
        .select("id, items")
        .in("id", saleIds);
      const itemsBySale = Object.fromEntries((sales || []).map((s) => [s.id, s.items]));
      groupList.forEach((g) => {
        g.items.forEach((it) => {
          it.order_items = Array.isArray(itemsBySale[it.sale_id]) ? itemsBySale[it.sale_id] : [];
        });
      });
    }

    setDebtors(groupList);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = debtors.filter((g) => {
      if (q) {
        const hay = `${g.name || ""} ${g.phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const oldestDays = daysSince(g.oldest_at) || 0;
      if (filter === "vencidos" && oldestDays <= 7) return false;
      if (filter === "al_dia" && oldestDays >= 3) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "debt") return b.total - a.total;
      if (sort === "oldest") return (a.oldest_at || "").localeCompare(b.oldest_at || "");
      if (sort === "name") return (a.name || "").localeCompare(b.name || "");
      if (sort === "usage") {
        const ua = a.credit_limit_ref > 0 ? a.total / a.credit_limit_ref : 0;
        const ub = b.credit_limit_ref > 0 ? b.total / b.credit_limit_ref : 0;
        return ub - ua;
      }
      return 0;
    });
    return list;
  }, [debtors, search, filter, sort]);

  const kpis = useMemo(() => {
    const totalDebt = debtors.reduce((s, g) => s + g.total, 0);
    const count = debtors.length;
    const vencidos = debtors.filter((g) => (daysSince(g.oldest_at) || 0) > 7).length;
    const sinLimite = debtors.filter((g) => g.credit_limit_ref > 0 && g.total > g.credit_limit_ref).length;
    return { totalDebt, count, vencidos, sinLimite };
  }, [debtors]);

  const openPayFIFO = (group) => {
    setPayTarget({ kind: "group", group });
    setPayAmount(group.total.toFixed(2));
    setPayMethod("");
    setPayRef("");
  };

  const openPayCredit = (credit, group) => {
    setPayTarget({ kind: "credit", credit, group });
    setPayAmount(Number(credit.outstanding).toFixed(2));
    setPayMethod("");
    setPayRef("");
  };

  const cancelPay = () => {
    setPayTarget(null);
    setPayAmount("");
    setPayMethod("");
    setPayRef("");
  };

  const confirmPay = async () => {
    if (!payTarget || !payMethod || !payAmount) return;
    const total = parseFloat(payAmount);
    if (!Number.isFinite(total) || total <= 0) {
      alert("Monto inválido");
      return;
    }
    const maxOutstanding = payTarget.kind === "group"
      ? payTarget.group.total
      : Number(payTarget.credit.outstanding);
    if (total > maxOutstanding + 0.01) {
      alert(`El monto excede lo pendiente (${formatREF(maxOutstanding)})`);
      return;
    }

    setProcessing(true);
    try {
      if (payTarget.kind === "credit") {
        await applyToCredit(payTarget.credit, total, payMethod, payRef, false);
      } else {
        // FIFO: oldest first
        const sorted = [...payTarget.group.items].sort(
          (a, b) => (a.created_at || "").localeCompare(b.created_at || "")
        );
        let remaining = total;
        const isPartial = total < payTarget.group.total - 0.005;
        for (const credit of sorted) {
          if (remaining <= 0.005) break;
          const outstanding = Number(credit.outstanding);
          if (outstanding <= 0) continue;
          const apply = Math.min(remaining, outstanding);
          await applyToCredit(credit, apply, payMethod, payRef, isPartial);
          remaining -= apply;
        }
      }
      cancelPay();
      await load();
    } catch (err) {
      alert("Error registrando pago: " + err.message);
    }
    setProcessing(false);
  };

  const applyToCredit = async (credit, amount, method, ref, isPartial) => {
    const { data: paymentRow, error: payErr } = await supabase
      .from("cantina_credit_payments")
      .insert({
        credit_id: credit.id,
        amount_ref: amount,
        amount_bs: rate?.usd ? amount * rate.usd : null,
        payment_method: method,
        reference: ref || null,
        exchange_rate_bs: rate?.usd || null,
        notes: isPartial ? "Pago parcial FIFO" : null,
        created_by: user?.name || "Cantina",
      })
      .select("id")
      .single();
    if (payErr) throw payErr;

    const newPaid = Number(credit.paid_amount_ref || 0) + amount;
    const newStatus = newPaid >= Number(credit.original_amount_ref) - 0.005 ? "paid" : "partial";
    const { error: upErr } = await supabase
      .from("cantina_credits")
      .update({ paid_amount_ref: newPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", credit.id);
    if (upErr) throw upErr;

    // Regla del negocio: loyalty SOLO en compras de contado.
    // No otorgar puntos por método crédito ni por pago al crédito.
  };

  const goVender = (group) => {
    if (!group.client_id) {
      alert("Este crédito no está ligado a un cliente registrado. Crea o asocia el cliente desde su perfil primero.");
      return;
    }
    if (onNavigateToVender) {
      onNavigateToVender({
        id: group.client_id,
        name: group.name || group.client_name,
      });
    }
  };

  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === payMethod);

  // ---------- PAY FORM PANEL ----------
  if (payTarget) {
    const g = payTarget.group;
    const isCredit = payTarget.kind === "credit";
    const maxAmount = isCredit ? Number(payTarget.credit.outstanding) : g.total;
    return (
      <div className="max-w-2xl mx-auto p-3 md:p-6 space-y-3">
        <button onClick={cancelPay} className="text-xs text-brand hover:underline flex items-center gap-1">
          <ArrowLeft size={12} /> Volver a deudores
        </button>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-4">
          <div className="bg-stone-50 rounded-lg p-3">
            <p className="font-bold text-sm text-stone-800">{g.name || "(sin nombre)"}</p>
            <p className="text-xs text-stone-500 mt-1">
              {isCredit
                ? `Cobrando 1 crédito · Pendiente: ${formatREF(maxAmount)}`
                : `${g.items.length} crédito${g.items.length !== 1 ? "s" : ""} · Total pendiente: ${formatREF(maxAmount)}`}
            </p>
            {!isCredit && (
              <p className="text-[11px] text-stone-400 mt-0.5">El monto se aplica primero al crédito más antiguo (FIFO).</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Monto a pagar ($)</label>
            <input
              type="number"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-3 text-base focus:border-brand focus:outline-none"
              autoFocus
            />
            {!isCredit && (
              <div className="flex gap-1.5 mt-1.5">
                <button onClick={() => setPayAmount((maxAmount / 2).toFixed(2))}
                  className="text-[11px] px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded text-stone-600">50%</button>
                <button onClick={() => setPayAmount(maxAmount.toFixed(2))}
                  className="text-[11px] px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded text-stone-600">Todo</button>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1.5">Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.filter((m) => m.id !== "cortesia").map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setPayMethod(m.id); setPayRef(""); }}
                  className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px] ${
                    payMethod === m.id
                      ? "border-brand bg-brand/5 text-brand"
                      : "border-stone-200 text-stone-600 hover:border-stone-300"
                  }`}
                >
                  <span>{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </div>

          {(selectedMethod?.needsRef || selectedMethod?.acceptsRef) && (
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">
                Referencia {!selectedMethod.needsRef && <span className="font-normal text-stone-400">(opcional)</span>}
              </label>
              <input
                type="text"
                maxLength={20}
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder={selectedMethod.refHint || "Número de referencia"}
                className="w-full border border-stone-300 rounded-lg px-3 py-3 text-base focus:border-brand focus:outline-none"
              />
            </div>
          )}

          <button
            onClick={confirmPay}
            disabled={processing || !payMethod || !payAmount}
            className="w-full py-3 rounded-xl bg-brand text-white font-bold text-sm disabled:opacity-30 hover:bg-brand-dark transition-all flex items-center justify-center gap-2 min-h-[48px]"
          >
            {processing ? (
              <><Loader2 size={16} className="animate-spin" /> Procesando...</>
            ) : (
              `Confirmar pago ${formatREF(parseFloat(payAmount || 0))}`
            )}
          </button>
        </div>
      </div>
    );
  }

  // ---------- LIST PANEL ----------
  return (
    <div className="max-w-5xl mx-auto p-3 md:p-6 space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="Deuda total" value={formatREF(kpis.totalDebt)} tone={kpis.totalDebt > 0 ? "red" : "muted"} />
        <KpiCard label="Deudores" value={String(kpis.count)} tone="default" />
        <KpiCard label="Vencidos >7d" value={String(kpis.vencidos)} tone={kpis.vencidos > 0 ? "red" : "muted"} />
        <KpiCard label="Sobre límite" value={String(kpis.sinLimite)} tone={kpis.sinLimite > 0 ? "red" : "muted"} />
      </div>

      {/* Filtros */}
      <div className="bg-white border border-stone-200 rounded-xl p-3 flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar deudor por nombre o teléfono..."
            className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-2 text-xs bg-white">
          {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="border border-stone-300 rounded-lg px-2 py-2 text-xs bg-white">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Lista de deudores */}
      <div className="space-y-2">
        {loading ? (
          <div className="bg-white border border-stone-200 rounded-xl py-12 text-center">
            <Loader2 size={20} className="inline-block animate-spin text-stone-400" />
            <p className="text-xs text-stone-400 mt-2">Cargando deudores...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl py-12 text-center">
            <AlertCircle size={24} className="inline-block text-stone-300 mb-2" />
            <p className="text-sm text-stone-500">{debtors.length === 0 ? "No hay deudores pendientes" : "Sin resultados con estos filtros"}</p>
          </div>
        ) : (
          filtered.map((g) => {
            const oldestDays = daysSince(g.oldest_at) || 0;
            const isOpen = expanded === g.key;
            const limit = g.credit_limit_ref || 0;
            const usagePct = limit > 0 ? Math.min(100, Math.round((g.total / limit) * 100)) : 0;
            const overLimit = limit > 0 && g.total > limit;
            const color = avatarColor(g.name || "");
            return (
              <div key={g.key} className={`${ageBg(oldestDays)} rounded-xl border border-stone-200 overflow-hidden`}>
                <div className="p-3 flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-sm font-bold shrink-0`}>
                    {avatarInitials(g.name || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-stone-800 truncate">
                        <ClientLink clientId={g.client_id} name={g.name} />
                      </p>
                      {g.is_vip && (
                        <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                          VIP
                        </span>
                      )}
                      {overLimit && (
                        <span className="inline-block bg-red-100 text-red-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Sobre límite
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 truncate mt-0.5">
                      {g.phone ? formatVePhone(g.phone) : "Sin teléfono"}
                      {" · "}{g.items.length} crédito{g.items.length !== 1 ? "s" : ""}
                      {" · "}<span className={ageColor(oldestDays)}>más antiguo {oldestDays === 0 ? "hoy" : oldestDays === 1 ? "ayer" : `hace ${oldestDays}d`}</span>
                    </p>
                    {limit > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] text-stone-500 mb-0.5">
                          <span>Límite {formatREF(limit)}</span>
                          <span className={overLimit ? "text-red-600 font-bold" : ""}>{usagePct}% usado</span>
                        </div>
                        <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${overLimit ? "bg-red-500" : usagePct >= 80 ? "bg-yellow-500" : "bg-green-500"}`}
                            style={{ width: `${Math.min(100, usagePct)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {g.last_payment_at && (
                      <p className="text-[10px] text-stone-400 mt-1">Último abono {relativeFromNow(g.last_payment_at)}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-brand">{formatREF(g.total)}</p>
                    <p className="text-[10px] text-stone-500">pendiente</p>
                  </div>
                </div>

                <div className="px-3 pb-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => openPayFIFO(g)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark transition-colors min-h-[44px]"
                  >
                    <Wallet size={14} /> Cobrar
                  </button>
                  <button
                    onClick={() => goVender(g)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-brand text-brand rounded-lg text-xs font-bold hover:bg-brand/5 transition-colors min-h-[44px]"
                  >
                    <ShoppingCart size={14} /> Venta a crédito
                  </button>
                  <button
                    onClick={() => setExpanded(isOpen ? null : g.key)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-stone-200 text-stone-600 rounded-lg text-xs font-medium hover:bg-stone-50 transition-colors min-h-[44px]"
                  >
                    {isOpen ? "Ocultar créditos" : "Ver créditos"}
                  </button>
                </div>

                {isOpen && (
                  <div className="bg-white/70 border-t border-stone-200 px-3 py-2 space-y-1.5">
                    {g.items
                      .slice()
                      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
                      .map((c) => {
                        const days = daysSince(c.created_at) || 0;
                        const orderItems = Array.isArray(c.order_items) ? c.order_items : [];
                        return (
                          <div key={c.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-stone-100 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-stone-600">
                                Original: {formatREF(c.original_amount_ref)}
                                {Number(c.paid_amount_ref || 0) > 0 && ` · Pagado: ${formatREF(c.paid_amount_ref)}`}
                              </p>
                              {orderItems.length > 0 && (
                                <p className="text-xs text-stone-500 mt-0.5">
                                  <span className="text-stone-400">Pidió: </span>
                                  {orderItems.map((it, i) => (
                                    <span key={i}>
                                      {i > 0 && <span className="text-stone-300"> · </span>}
                                      {it.qty}× {it.name}
                                    </span>
                                  ))}
                                </p>
                              )}
                              <p className={`text-xs mt-0.5 ${ageColor(days)}`}>
                                {days === 0 ? "Hoy" : days === 1 ? "Ayer" : `Hace ${days}d`}
                                {c.status === "partial" && " · Parcial"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <p className="text-xs font-bold text-brand whitespace-nowrap">{formatREF(c.outstanding)}</p>
                              <button
                                onClick={() => openPayCredit(c, g)}
                                className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark transition-colors min-h-[40px]"
                              >
                                Cobrar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone = "default" }) {
  const cls =
    tone === "red"   ? "text-red-600" :
    tone === "muted" ? "text-stone-400" :
                       "text-stone-800";
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-stone-500">{label}</p>
      <p className={`text-xl font-bold ${cls}`}>{value}</p>
    </div>
  );
}
