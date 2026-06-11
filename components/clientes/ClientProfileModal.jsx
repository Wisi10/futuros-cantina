"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { X, Edit2, Loader2, Wallet, ShoppingCart, AlertCircle, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, PAYMENT_METHODS, isManagerOrAbove } from "@/lib/utils";
import { avatarColor, avatarInitials, relativeFromNow, daysSince, formatVePhone } from "@/lib/clientHelpers";
import ClientFormModal from "./ClientFormModal";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const ageColor = (days) => {
  if (days == null) return "text-stone-500";
  if (days < 3) return "text-green-600";
  if (days <= 7) return "text-yellow-600";
  return "text-red-600";
};

export default function ClientProfileModal({ clientId, user, rate, onClose, onUpdated, onStartCreditSale }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Créditos del cliente
  const [credits, setCredits] = useState([]);
  const [creditPayments, setCreditPayments] = useState([]);
  const [creditLimit, setCreditLimit] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditTab, setCreditTab] = useState("pendientes"); // pendientes | abonos

  // Pay form (inline)
  const [payTarget, setPayTarget] = useState(null); // { kind: 'group' } | { kind: 'credit', credit }
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const [processing, setProcessing] = useState(false);

  // Edit credit limit
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");
  const isAdmin = isManagerOrAbove(user?.cantinaRole);

  // Deuda histórica (legacy debt sin tracking de productos)
  const [showLegacyModal, setShowLegacyModal] = useState(false);
  const [legacyAmount, setLegacyAmount] = useState("");
  const [legacyNotes, setLegacyNotes] = useState("");
  const [legacySaving, setLegacySaving] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data } = await supabase.rpc("get_cantina_client_profile", { p_client_id: clientId });
    setProfile(data || null);
    setLoading(false);
  }, [clientId]);

  const loadCredits = useCallback(async () => {
    if (!clientId) return;
    setCreditsLoading(true);

    // Créditos
    const { data: creditsData } = await supabase
      .from("cantina_credits")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    const enriched = (creditsData || []).map((c) => ({
      ...c,
      outstanding: Math.max(0, Number(c.original_amount_ref) - Number(c.paid_amount_ref || 0)),
    }));

    // Items pedidos de cada venta originaria
    const saleIds = enriched.map((c) => c.sale_id).filter(Boolean);
    if (saleIds.length > 0) {
      const { data: sales } = await supabase
        .from("cantina_sales")
        .select("id, items")
        .in("id", saleIds);
      const itemsBySale = Object.fromEntries((sales || []).map((s) => [s.id, s.items]));
      enriched.forEach((c) => {
        c.order_items = Array.isArray(itemsBySale[c.sale_id]) ? itemsBySale[c.sale_id] : [];
      });
    }
    setCredits(enriched);

    // Pagos (abonos) — join al credit_id
    const creditIds = enriched.map((c) => c.id);
    if (creditIds.length > 0) {
      const { data: paymentsData } = await supabase
        .from("cantina_credit_payments")
        .select("*")
        .in("credit_id", creditIds)
        .order("created_at", { ascending: false });
      setCreditPayments(paymentsData || []);
    } else {
      setCreditPayments([]);
    }

    // Límite de crédito
    const { data: clientRow } = await supabase
      .from("clients")
      .select("credit_limit_ref")
      .eq("id", clientId)
      .maybeSingle();
    setCreditLimit(Number(clientRow?.credit_limit_ref || 0));

    setCreditsLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCredits(); }, [loadCredits]);

  // ----- Pay form -----
  const pendingCredits = useMemo(() => credits.filter((c) => c.status === "pending" || c.status === "partial"), [credits]);
  const totalOutstanding = useMemo(() => pendingCredits.reduce((s, c) => s + c.outstanding, 0), [pendingCredits]);
  const oldestPendingAt = useMemo(() => {
    if (pendingCredits.length === 0) return null;
    return pendingCredits.reduce((min, c) => (!min || (c.created_at || "") < min ? c.created_at : min), null);
  }, [pendingCredits]);

  const openPayFIFO = () => {
    if (pendingCredits.length === 0) return;
    setPayTarget({ kind: "group" });
    setPayAmount(totalOutstanding.toFixed(2));
    setPayMethod("");
    setPayRef("");
  };

  const openPayCredit = (credit) => {
    setPayTarget({ kind: "credit", credit });
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

    if (paymentRow?.id) {
      try {
        await supabase.rpc("award_loyalty_for_credit_payment", { p_payment_id: paymentRow.id });
      } catch (e) { console.error("[LOYALTY] credit payment award error:", e); }
    }
  };

  const confirmPay = async () => {
    if (!payTarget || !payMethod || !payAmount) return;
    const total = parseFloat(payAmount);
    if (!Number.isFinite(total) || total <= 0) {
      alert("Monto inválido");
      return;
    }
    const maxOutstanding = payTarget.kind === "credit"
      ? Number(payTarget.credit.outstanding)
      : totalOutstanding;
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
        const sorted = [...pendingCredits].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
        let remaining = total;
        const isPartial = total < totalOutstanding - 0.005;
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
      await loadCredits();
      if (onUpdated) await onUpdated();
    } catch (err) {
      alert("Error registrando pago: " + err.message);
    }
    setProcessing(false);
  };

  // ----- Limit edit -----
  const startEditLimit = () => {
    setEditingLimit(true);
    setLimitDraft(String(creditLimit || 0));
  };

  const saveLimit = async () => {
    const value = parseFloat(limitDraft);
    if (!Number.isFinite(value) || value < 0) {
      alert("Límite inválido");
      return;
    }
    const { error } = await supabase.rpc("set_client_credit_limit", {
      p_client_id: clientId,
      p_limit: value,
    });
    if (error) {
      alert("Error actualizando límite: " + error.message);
      return;
    }
    setCreditLimit(value);
    setEditingLimit(false);
  };

  // ----- Deuda histórica (legacy debt) -----
  const openLegacyModal = () => {
    setLegacyAmount("");
    setLegacyNotes("");
    setShowLegacyModal(true);
  };

  const saveLegacyDebt = async () => {
    const amount = parseFloat(legacyAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Ingresa un monto válido (mayor a 0)");
      return;
    }
    setLegacySaving(true);
    const profileClient = profile?.client;
    const fullName = `${profileClient?.first_name || ""} ${profileClient?.last_name || ""}`.trim() || "Cliente";
    const { error } = await supabase.from("cantina_credits").insert({
      id: "cre_lg_" + Math.random().toString(36).slice(2, 14),
      client_id: clientId,
      client_name: fullName,
      sale_id: null,
      source: "legacy",
      original_amount_ref: amount,
      paid_amount_ref: 0,
      status: "pending",
      notes: legacyNotes.trim() || null,
      created_by: user?.name || "Cantina",
    });
    setLegacySaving(false);
    if (error) {
      alert("Error guardando deuda histórica: " + error.message);
      return;
    }
    setShowLegacyModal(false);
    await loadCredits();
    if (onUpdated) await onUpdated();
  };

  // ----- Credit sale (navegar a Vender) -----
  const handleStartCreditSale = () => {
    if (!onStartCreditSale || !c) return;
    onStartCreditSale({
      id: c.id,
      name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.first_name || c.last_name || "",
    });
    if (onClose) onClose();
  };

  if (!clientId) return null;

  const c = profile?.client;
  const k = profile?.kpis || {};
  const favorites = profile?.favorites || [];
  const recent = profile?.recent || [];
  const fullName = c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(sin nombre)" : "";
  const color = avatarColor(fullName);
  const usagePct = creditLimit > 0 ? Math.min(100, Math.round((totalOutstanding / creditLimit) * 100)) : 0;
  const overLimit = creditLimit > 0 && totalOutstanding > creditLimit;
  const oldestDays = daysSince(oldestPendingAt);

  const selectedPayMethod = PAYMENT_METHODS.find((m) => m.id === payMethod);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between p-5 border-b border-stone-200">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {c && (
                <div className={`w-14 h-14 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-lg font-bold shrink-0`}>
                  {avatarInitials(fullName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-stone-800 truncate">{fullName || "Cargando..."}</h2>
                  {k.is_vip && (
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
                {c && (
                  <p className="text-xs text-stone-500 truncate">
                    {c.phone ? formatVePhone(c.phone) : "Sin telefono"}
                    {c.cedula && ` · cedula ${c.cedula}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {c && (
                <button onClick={() => setEditing(true)} className="p-2 rounded-lg hover:bg-stone-100 text-stone-500" title="Editar">
                  <Edit2 size={14} />
                </button>
              )}
              <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg">
                <X size={18} className="text-stone-400" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <Loader2 size={20} className="animate-spin text-stone-400" />
            </div>
          ) : !profile ? (
            <div className="flex-1 flex items-center justify-center p-8 text-stone-400 text-sm">Cliente no encontrado</div>
          ) : payTarget ? (
            /* ===== PAY FORM ===== */
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <button onClick={cancelPay} className="text-xs text-brand hover:underline">&larr; Volver al perfil</button>
              <div className="bg-stone-50 rounded-lg p-3">
                <p className="font-bold text-sm text-stone-800">{fullName}</p>
                <p className="text-xs text-stone-500 mt-1">
                  {payTarget.kind === "credit"
                    ? `Cobrando 1 crédito · Pendiente: ${formatREF(payTarget.credit.outstanding)}`
                    : `${pendingCredits.length} crédito${pendingCredits.length !== 1 ? "s" : ""} · Total pendiente: ${formatREF(totalOutstanding)}`}
                </p>
                {payTarget.kind === "group" && (
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
                {payTarget.kind === "group" && (
                  <div className="flex gap-1.5 mt-1.5">
                    <button onClick={() => setPayAmount((totalOutstanding / 2).toFixed(2))}
                      className="text-[11px] px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded text-stone-600">50%</button>
                    <button onClick={() => setPayAmount(totalOutstanding.toFixed(2))}
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

              {(selectedPayMethod?.needsRef || selectedPayMethod?.acceptsRef) && (
                <div>
                  <label className="text-xs font-medium text-stone-500 block mb-1">
                    Referencia {!selectedPayMethod.needsRef && <span className="font-normal text-stone-400">(opcional)</span>}
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder={selectedPayMethod.refHint || "Número de referencia"}
                    className="w-full border border-stone-300 rounded-lg px-3 py-3 text-base focus:border-brand focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={confirmPay}
                disabled={processing || !payMethod || !payAmount}
                className="w-full py-3 rounded-xl bg-brand text-white font-bold text-sm disabled:opacity-30 hover:bg-brand-dark transition-all flex items-center justify-center gap-2 min-h-[48px]"
              >
                {processing
                  ? <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                  : `Confirmar pago ${formatREF(parseFloat(payAmount || 0))}`}
              </button>
            </div>
          ) : (
            /* ===== PROFILE ===== */
            <div className="flex-1 overflow-y-auto">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-5 border-b border-stone-200">
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-0.5">Visitas</p>
                  <p className="text-xl font-bold text-stone-800">{k.visits || 0}</p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-0.5">Total gastado</p>
                  <p className="text-xl font-bold text-brand">{formatREF(k.total_ref || 0)}</p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-0.5">Pts actuales</p>
                  <p className="text-xl font-bold text-gold">{Number(k.points_balance || 0).toLocaleString()}</p>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-0.5">Última visita</p>
                  <p className="text-sm font-bold text-stone-800">{relativeFromNow(k.last_visit_at)}</p>
                </div>
              </div>

              {/* === CRÉDITOS === */}
              <div className="p-5 border-b border-stone-200 bg-stone-50/30">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">Créditos &amp; Abonos</p>
                  <div className="flex items-center gap-2">
                    {pendingCredits.length > 0 && (
                      <button
                        onClick={openPayFIFO}
                        className="flex items-center gap-1.5 px-3 py-2 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dark transition-colors min-h-[40px]"
                      >
                        <Wallet size={12} /> Cobrar
                      </button>
                    )}
                    {onStartCreditSale && c?.id && (
                      <button
                        onClick={handleStartCreditSale}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-brand text-brand rounded-lg text-xs font-bold hover:bg-brand/5 transition-colors min-h-[40px]"
                      >
                        <ShoppingCart size={12} /> Venta a crédito
                      </button>
                    )}
                    {c?.id && (
                      <button
                        onClick={openLegacyModal}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-stone-300 text-stone-600 rounded-lg text-xs font-bold hover:bg-stone-50 transition-colors min-h-[40px]"
                        title="Registrar deuda histórica del cliente sin tracking de productos"
                      >
                        <Wallet size={12} /> Deuda histórica
                      </button>
                    )}
                  </div>
                </div>

                {/* Resumen deuda + límite */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                  <div className="bg-white border border-stone-200 rounded-lg p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-stone-500">Deuda actual</p>
                    <p className={`text-lg font-bold ${totalOutstanding > 0 ? "text-red-600" : "text-stone-400"}`}>{formatREF(totalOutstanding)}</p>
                    <p className="text-[10px] text-stone-400">{pendingCredits.length} crédito{pendingCredits.length !== 1 ? "s" : ""} abierto{pendingCredits.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wider text-stone-500">Límite</p>
                      {isAdmin && !editingLimit && (
                        <button onClick={startEditLimit} className="p-0.5 hover:bg-stone-100 rounded" title="Editar límite">
                          <Edit2 size={10} className="text-stone-400" />
                        </button>
                      )}
                    </div>
                    {editingLimit ? (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          type="number"
                          step="0.01"
                          value={limitDraft}
                          onChange={(e) => setLimitDraft(e.target.value)}
                          className="w-full border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none"
                          autoFocus
                        />
                        <button onClick={saveLimit} className="p-1 bg-brand text-white rounded hover:bg-brand-dark">
                          <Check size={12} />
                        </button>
                        <button onClick={() => setEditingLimit(false)} className="p-1 bg-stone-200 text-stone-600 rounded hover:bg-stone-300">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-lg font-bold text-stone-800">{formatREF(creditLimit)}</p>
                    )}
                  </div>
                  <div className="bg-white border border-stone-200 rounded-lg p-2.5 col-span-2 md:col-span-1">
                    <p className="text-[10px] uppercase tracking-wider text-stone-500">% Usado</p>
                    <p className={`text-lg font-bold ${overLimit ? "text-red-600" : usagePct >= 80 ? "text-yellow-600" : "text-green-600"}`}>{creditLimit > 0 ? `${usagePct}%` : "—"}</p>
                    {creditLimit > 0 && (
                      <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full ${overLimit ? "bg-red-500" : usagePct >= 80 ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${Math.min(100, usagePct)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabs internos */}
                <div className="flex gap-1 border-b border-stone-200 mb-2">
                  <button
                    onClick={() => setCreditTab("pendientes")}
                    className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                      creditTab === "pendientes" ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    Pendientes
                    {pendingCredits.length > 0 && (
                      <span className="ml-1.5 bg-stone-200 text-stone-700 text-[9px] px-1.5 py-0.5 rounded-full">{pendingCredits.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setCreditTab("abonos")}
                    className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                      creditTab === "abonos" ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    Abonos
                    {creditPayments.length > 0 && (
                      <span className="ml-1.5 bg-stone-200 text-stone-700 text-[9px] px-1.5 py-0.5 rounded-full">{creditPayments.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setCreditTab("historial")}
                    className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                      creditTab === "historial" ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    Cerrados
                  </button>
                </div>

                {/* Contenido tab */}
                {creditsLoading ? (
                  <p className="text-xs text-stone-400 text-center py-4 animate-pulse">Cargando...</p>
                ) : creditTab === "pendientes" ? (
                  pendingCredits.length === 0 ? (
                    <p className="text-xs text-stone-400 text-center py-4">Sin créditos pendientes</p>
                  ) : (
                    <div className="space-y-1.5">
                      {pendingCredits
                        .slice()
                        .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
                        .map((cr) => {
                          const days = daysSince(cr.created_at);
                          const orderItems = Array.isArray(cr.order_items) ? cr.order_items : [];
                          return (
                            <div key={cr.id} className="bg-white border border-stone-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-stone-700 flex items-center gap-1.5 flex-wrap">
                                  {cr.source === "legacy" && (
                                    <span className="inline-block bg-stone-200 text-stone-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      Histórica
                                    </span>
                                  )}
                                  <span>
                                    Original: <span className="font-medium">{formatREF(cr.original_amount_ref)}</span>
                                    {Number(cr.paid_amount_ref || 0) > 0 && (
                                      <> · Pagado: <span className="font-medium">{formatREF(cr.paid_amount_ref)}</span></>
                                    )}
                                  </span>
                                </p>
                                {cr.source === "legacy" && cr.notes && (
                                  <p className="text-xs text-stone-500 mt-0.5 italic">{cr.notes}</p>
                                )}
                                {cr.source !== "legacy" && orderItems.length > 0 && (
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
                                <p className={`text-[11px] mt-0.5 ${ageColor(days)}`}>
                                  {fmtDate(cr.created_at)} · {days === 0 ? "Hoy" : days === 1 ? "Ayer" : `Hace ${days}d`}
                                  {cr.status === "partial" && " · Parcial"}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <p className="text-sm font-bold text-brand whitespace-nowrap">{formatREF(cr.outstanding)}</p>
                                <button
                                  onClick={() => openPayCredit(cr)}
                                  className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark transition-colors min-h-[36px]"
                                >
                                  Cobrar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )
                ) : creditTab === "abonos" ? (
                  creditPayments.length === 0 ? (
                    <p className="text-xs text-stone-400 text-center py-4">Sin abonos registrados</p>
                  ) : (
                    <div className="space-y-1.5">
                      {creditPayments.map((p) => {
                        const method = PAYMENT_METHODS.find((m) => m.id === p.payment_method);
                        return (
                          <div key={p.id} className="bg-white border border-stone-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-stone-700">
                                {method ? <><span>{method.icon}</span> {method.label}</> : p.payment_method}
                                {p.reference && <span className="text-stone-400"> · ref {p.reference}</span>}
                              </p>
                              <p className="text-[11px] text-stone-400">{fmtDateTime(p.created_at)}{p.created_by && ` · ${p.created_by}`}</p>
                            </div>
                            <p className="text-sm font-bold text-green-600 whitespace-nowrap">+{formatREF(p.amount_ref)}</p>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  /* historial: créditos pagados */
                  (() => {
                    const closed = credits.filter((c) => c.status === "paid");
                    if (closed.length === 0) {
                      return <p className="text-xs text-stone-400 text-center py-4">Sin créditos cerrados</p>;
                    }
                    return (
                      <div className="space-y-1.5">
                        {closed.map((cr) => (
                          <div key={cr.id} className="bg-white border border-stone-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-stone-600">
                                Original: <span className="font-medium">{formatREF(cr.original_amount_ref)}</span>
                              </p>
                              <p className="text-[11px] text-stone-400">{fmtDate(cr.created_at)}</p>
                            </div>
                            <span className="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Pagado</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}

                {oldestPendingAt && pendingCredits.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-stone-400">
                    <AlertCircle size={10} />
                    Más antiguo: {fmtDate(oldestPendingAt)} (<span className={ageColor(oldestDays)}>
                      {oldestDays === 0 ? "hoy" : oldestDays === 1 ? "ayer" : `hace ${oldestDays}d`}
                    </span>)
                  </div>
                )}
              </div>

              {/* Favoritos */}
              <div className="p-5 border-b border-stone-200">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-2">Productos favoritos</p>
                {favorites.length === 0 ? (
                  <p className="text-xs text-stone-400">Sin compras todavia.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {favorites.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 text-xs px-2 py-1 rounded-full">
                        {f.product_name} <span className="text-stone-400">({f.count}x)</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Historial reciente */}
              <div className="p-5">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-2">Historial reciente</p>
                {recent.length === 0 ? (
                  <p className="text-xs text-stone-400">Sin ventas.</p>
                ) : (
                  <div className="space-y-1.5">
                    {recent.map((s) => {
                      const items = Array.isArray(s.items) ? s.items : [];
                      const summary = items.slice(0, 3).map((i) => `${i.name} x${i.qty}`).join(" + ");
                      const more = items.length > 3 ? ` +${items.length - 3}` : "";
                      return (
                        <div key={s.id} className="flex items-center justify-between text-sm border-b border-stone-100 pb-1.5 last:border-0 last:pb-0">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-stone-500">{fmtDate(s.created_at)}</p>
                            <p className="text-stone-700 truncate">{summary}{more}</p>
                          </div>
                          <span className="font-medium text-stone-800 ml-2 shrink-0">{formatREF(s.total_ref)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ClientFormModal
          client={c}
          user={user}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
            await loadCredits();
            if (onUpdated) await onUpdated();
          }}
        />
      )}

      {showLegacyModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => !legacySaving && setShowLegacyModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-stone-200">
              <div>
                <h3 className="text-base font-bold text-stone-800 flex items-center gap-2">
                  <Wallet size={16} className="text-brand" /> Deuda histórica
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  Para clientes con cuenta abierta sin tracking de productos. Solo registra el monto que deben.
                </p>
              </div>
              <button
                onClick={() => !legacySaving && setShowLegacyModal(false)}
                className="p-1 rounded hover:bg-stone-100 text-stone-500 shrink-0"
                disabled={legacySaving}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1 block">
                  Monto que debe (REF) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={legacyAmount}
                  onChange={(e) => setLegacyAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-base focus:border-brand focus:outline-none"
                />
                {parseFloat(legacyAmount) > 0 && rate?.usd && (
                  <p className="text-[11px] text-stone-400 mt-1">
                    = Bs. {(parseFloat(legacyAmount) * rate.usd).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-stone-300 ml-1">(tasa: {rate.usd})</span>
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1 block">
                  Notas (opcional)
                </label>
                <textarea
                  value={legacyNotes}
                  onChange={(e) => setLegacyNotes(e.target.value)}
                  placeholder="Ej: Cuenta abierta desde diciembre 2025"
                  rows={2}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none resize-none"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <p className="text-[11px] text-amber-800">
                  El cliente podrá pagar este monto desde "Cobrar". El abono descontará la deuda igual que un crédito normal.
                </p>
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-stone-200">
              <button
                onClick={() => setShowLegacyModal(false)}
                disabled={legacySaving}
                className="flex-1 py-2.5 bg-stone-200 hover:bg-stone-300 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveLegacyDebt}
                disabled={legacySaving || !legacyAmount}
                className="flex-1 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {legacySaving ? <Loader2 size={14} className="animate-spin" /> : null}
                {legacySaving ? "Guardando..." : "Registrar deuda"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
