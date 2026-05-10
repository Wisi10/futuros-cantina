"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowLeft, Loader2, Search, AlertCircle, User, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBs, PAYMENT_METHODS, METHOD_LABELS, ProductImage } from "@/lib/utils";
import ClientLink from "@/components/shared/ClientLink";

// Mixed-mode methods (everything except credit). Cortesia is exclusive.
const MIXED_METHODS = PAYMENT_METHODS.filter((m) => !m.exclusive);

function round2(n) { return Math.round(Number(n) * 100) / 100; }

export default function PaymentModal({ cart, rate, processing, saleClient, userRole, onAssociateClient, onConfirm, onConfirmCredit, onBack }) {
  const totalRef = round2(cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0));
  const hasTasa = !!rate;

  // Mode: mixed (default) | credit | cortesia
  const [mode, setMode] = useState("mixed");

  // Mixed payments state
  const [payments, setPayments] = useState([]); // {tmpId, method, amount_ref, reference}
  const [pendingMethod, setPendingMethod] = useState(null); // selected method waiting for amount input
  const [pendingAmount, setPendingAmount] = useState("");
  const [pendingRef, setPendingRef] = useState("");

  // Overpay handling
  const [overpayAction, setOverpayAction] = useState(null); // 'change' | 'credit'
  const [changeMethod, setChangeMethod] = useState("cash_bs");

  // Credit state
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDebts, setClientDebts] = useState({});
  const [creditNotes, setCreditNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [manualClientName, setManualClientName] = useState("");
  const [useManualClient, setUseManualClient] = useState(false);

  // Loyalty client picker (separate from credit)
  const [loyaltyPickerOpen, setLoyaltyPickerOpen] = useState(false);
  const [loyaltySearch, setLoyaltySearch] = useState("");
  const [loyaltyResults, setLoyaltyResults] = useState([]);
  const [loyaltySearching, setLoyaltySearching] = useState(false);
  const [loyaltyAttaching, setLoyaltyAttaching] = useState(false);

  const paidSum = useMemo(() => round2(payments.reduce((s, p) => s + Number(p.amount_ref || 0), 0)), [payments]);
  const remaining = round2(totalRef - paidSum);
  const overpay = round2(paidSum - totalRef);
  const isCredit = mode === "credit";
  const isCortesia = mode === "cortesia";
  const isMixed = mode === "mixed";

  // Reset overpay action if no longer overpaying
  useEffect(() => {
    if (overpay <= 0.01 && overpayAction) setOverpayAction(null);
  }, [overpay, overpayAction]);

  // Search clients debounce
  const searchClients = useCallback(async (query) => {
    if (!query || query.length < 2 || !supabase) { setClients([]); return; }
    setSearching(true);
    let data = [];
    try {
      const res = await supabase.rpc("search_clients", { query });
      data = res.data || [];
    } catch (e) { console.error("[CREDIT SEARCH] error:", e); }
    if (data) {
      setClients(data);
      const ids = data.map((c) => c.id);
      if (ids.length > 0) {
        const { data: credits } = await supabase
          .from("cantina_credits")
          .select("client_id, original_amount_ref, paid_amount_ref")
          .in("client_id", ids)
          .in("status", ["pending", "partial"]);
        if (credits) {
          const debts = {};
          credits.forEach((c) => {
            debts[c.client_id] = (debts[c.client_id] || 0) + (Number(c.original_amount_ref) - Number(c.paid_amount_ref || 0));
          });
          setClientDebts(debts);
        }
      }
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!isCredit) return;
    const timer = setTimeout(() => searchClients(clientSearch), 300);
    return () => clearTimeout(timer);
  }, [clientSearch, isCredit, searchClients]);

  // Loyalty picker
  const searchLoyaltyClients = useCallback(async (query) => {
    if (!query || query.length < 2 || !supabase) {
      setLoyaltyResults([]); setLoyaltySearching(false); return;
    }
    setLoyaltySearching(true);
    try {
      const { data } = await supabase.rpc("search_clients", { query });
      setLoyaltyResults(data || []);
    } catch { setLoyaltyResults([]); }
    setLoyaltySearching(false);
  }, []);

  useEffect(() => {
    if (!loyaltyPickerOpen) return;
    const timer = setTimeout(() => searchLoyaltyClients(loyaltySearch), 300);
    return () => clearTimeout(timer);
  }, [loyaltySearch, loyaltyPickerOpen, searchLoyaltyClients]);

  const attachLoyaltyClient = async (c) => {
    if (loyaltyAttaching || !onAssociateClient) return;
    setLoyaltyAttaching(true);
    try {
      const { data } = await supabase.rpc("get_client_profile", { client_id_param: c.id });
      const profile = data?.[0];
      onAssociateClient({
        id: c.id,
        name: profile?.full_name || c.full_name || "Cliente",
        cedula: profile?.cedula || c.cedula || null,
        points: Number(profile?.loyalty_points || 0),
      });
    } catch {
      onAssociateClient({ id: c.id, name: c.full_name || "Cliente", cedula: c.cedula || null, points: 0 });
    }
    setLoyaltyPickerOpen(false); setLoyaltySearch(""); setLoyaltyResults([]);
    setLoyaltyAttaching(false);
  };

  const detachLoyaltyClient = () => {
    if (onAssociateClient) onAssociateClient(null);
    setLoyaltyPickerOpen(false); setLoyaltySearch(""); setLoyaltyResults([]);
  };

  // Mixed payments helpers
  const startAddPayment = (methodId) => {
    setPendingMethod(methodId);
    setPendingAmount(remaining > 0 ? remaining.toFixed(2) : "0");
    setPendingRef("");
  };

  const cancelAddPayment = () => {
    setPendingMethod(null); setPendingAmount(""); setPendingRef("");
  };

  const commitAddPayment = () => {
    const amt = round2(Number(pendingAmount));
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Monto invalido");
      return;
    }
    const methodObj = MIXED_METHODS.find((m) => m.id === pendingMethod);
    if (methodObj?.needsRef && !pendingRef.trim()) {
      alert(`Referencia requerida para ${methodObj.label}`);
      return;
    }
    setPayments((prev) => [
      ...prev,
      {
        tmpId: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        method: pendingMethod,
        amount_ref: amt,
        reference: pendingRef.trim() || null,
      },
    ]);
    cancelAddPayment();
  };

  const removePayment = (tmpId) => {
    setPayments((prev) => prev.filter((p) => p.tmpId !== tmpId));
  };

  const switchToCredit = () => {
    setMode("credit");
    setPayments([]); cancelAddPayment(); setOverpayAction(null);
  };

  const switchToCortesia = () => {
    if (!saleClient?.id) {
      alert("Asocia un cliente antes de dar cortesia.");
      return;
    }
    setMode("cortesia");
    setPayments([]); cancelAddPayment(); setOverpayAction(null);
  };

  const switchToMixed = () => {
    setMode("mixed");
    setSelectedClient(null); setManualClientName(""); setUseManualClient(false);
  };

  const canConfirm = (() => {
    if (processing) return false;
    if (isCredit) {
      return !!(selectedClient || (useManualClient && manualClientName.trim()));
    }
    if (isCortesia) {
      return !!saleClient?.id;
    }
    // Mixed
    if (paidSum < totalRef - 0.01) return false; // not enough
    if (overpay > 0.01) {
      // Need explicit overpay action selection
      if (!overpayAction) return false;
      if (overpayAction === "credit" && !saleClient?.id) return false;
      if (overpayAction === "change" && !changeMethod) return false;
    }
    return payments.length > 0;
  })();

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (isCredit) {
      const clientId = selectedClient?.id || null;
      const clientName = selectedClient
        ? (selectedClient.full_name || "").trim().replace(/\s+/g, " ")
        : manualClientName.trim();
      onConfirmCredit({ clientId, clientName, notes: creditNotes, dueDate: dueDate || null });
      return;
    }
    if (isCortesia) {
      // Single-payment cortesia
      onConfirm({
        payments: [{ method: "cortesia", amount_ref: totalRef, reference: null }],
        legacy_method: "cortesia",
      });
      return;
    }
    // Mixed
    const finalPayments = payments.map((p) => ({
      method: p.method, amount_ref: round2(p.amount_ref), reference: p.reference,
    }));
    let change = null;
    if (overpay > 0.01) {
      if (overpayAction === "change") {
        change = { kind: "cash", amount: overpay, method: changeMethod };
      } else if (overpayAction === "credit") {
        change = { kind: "credit", amount: overpay, client_id: saleClient?.id, client_name: saleClient?.name };
      }
    }
    const distinctMethods = [...new Set(finalPayments.map((p) => p.method))];
    const legacy = distinctMethods.length === 1 ? distinctMethods[0] : "mixed";
    onConfirm({ payments: finalPayments, change, legacy_method: legacy });
  };

  return (
    <div className="fixed inset-0 bg-brand-cream-light z-40 flex flex-col">
      <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} disabled={processing} className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-30">
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-bold text-lg text-stone-800">Metodo de pago</h2>
      </div>

      {/* Loyalty client picker */}
      <div className="bg-white border-b border-stone-200 px-4 py-3">
        <div className="max-w-lg mx-auto">
          {saleClient ? (
            <div className="flex items-start justify-between gap-3 bg-gold/5 border border-gold/20 rounded-lg p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-gold font-medium">Cliente asociado</p>
                <p className="text-sm font-bold text-stone-800 truncate">
                  {saleClient.id ? <ClientLink clientId={saleClient.id} name={saleClient.name} /> : saleClient.name}
                </p>
                <p className="text-[11px] text-stone-500">{saleClient.cedula ? `CI: ${saleClient.cedula}` : "Sin cedula"}</p>
                <p className="text-xs text-gold font-medium mt-0.5">{Number(saleClient.points || 0).toLocaleString()} pts</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => { onAssociateClient(null); setLoyaltyPickerOpen(true); }} className="text-xs text-brand hover:underline">Cambiar</button>
                <button onClick={detachLoyaltyClient} className="text-xs text-stone-400 hover:text-red-500">Quitar</button>
              </div>
            </div>
          ) : !loyaltyPickerOpen ? (
            <button onClick={() => setLoyaltyPickerOpen(true)} disabled={processing}
              className="w-full py-2.5 rounded-lg border-2 border-dashed border-stone-300 text-stone-500 text-sm font-medium hover:border-brand hover:text-brand transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              <User size={14} /> Agregar cliente para puntos
            </button>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input type="text" value={loyaltySearch}
                  onChange={(e) => setLoyaltySearch(e.target.value)}
                  placeholder="Buscar por nombre o cedula..."
                  className="w-full border border-stone-300 rounded-lg pl-9 pr-9 py-2 text-sm focus:border-brand focus:outline-none"
                  autoFocus />
                {loyaltySearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-stone-400" />}
              </div>
              {loyaltySearch.length >= 2 && !loyaltySearching && loyaltyResults.length === 0 && (
                <p className="text-xs text-stone-400 text-center py-2">Sin resultados</p>
              )}
              {loyaltyResults.length > 0 && (
                <div className="border border-stone-200 rounded-lg overflow-hidden max-h-48 overflow-auto">
                  {loyaltyResults.map((c) => (
                    <button key={c.id} onClick={() => attachLoyaltyClient(c)} disabled={loyaltyAttaching}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 border-b border-stone-100 last:border-0 disabled:opacity-50">
                      <p className="text-sm font-medium text-stone-700">{c.full_name || "?"}</p>
                      {c.cedula && <p className="text-[11px] text-stone-400">CI: {c.cedula}</p>}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => { setLoyaltyPickerOpen(false); setLoyaltySearch(""); setLoyaltyResults([]); }}
                className="text-xs text-stone-400 hover:text-stone-600">Cancelar</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 max-w-lg mx-auto w-full">
        {/* Order summary */}
        <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
          <p className="text-xs text-stone-500 font-medium mb-2">Resumen de venta</p>
          <div className="space-y-1 mb-3">
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center justify-between text-sm gap-2">
                <span className="text-stone-600 flex items-center gap-1.5">
                  <ProductImage product={item.product} size={20} /> {item.qty}x {item.product.name}
                </span>
                <span className="font-medium">REF {(Number(item.product.price_ref) * item.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-100 pt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-stone-500">Total</span>
              <span className="text-2xl font-bold text-brand">REF {totalRef.toFixed(2)}</span>
            </div>
            {hasTasa && (
              <p className="text-right text-sm text-stone-400">{formatBs(totalRef, rate.eur)}</p>
            )}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-4">
          <button onClick={switchToMixed} disabled={processing}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              isMixed ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}>Pago</button>
          <button onClick={switchToCredit} disabled={processing}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              isCredit ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}>Credito</button>
          {userRole === "admin" && (
            <button onClick={switchToCortesia} disabled={processing}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                isCortesia ? "bg-gold text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}>Cortesia</button>
          )}
        </div>

        {/* MIXED payments builder */}
        {isMixed && (
          <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4 space-y-3">
            {/* Restante / overpay summary */}
            <div className="bg-stone-50 rounded-lg p-3">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Pagado</span>
                <span className="font-semibold text-stone-700">REF {paidSum.toFixed(2)}</span>
              </div>
              {remaining > 0.01 ? (
                <div className="flex justify-between text-sm font-bold mt-1">
                  <span className="text-amber-700">Restante</span>
                  <span className="text-amber-700">REF {remaining.toFixed(2)}</span>
                </div>
              ) : overpay > 0.01 ? (
                <div className="flex justify-between text-sm font-bold mt-1">
                  <span className="text-blue-700">Sobrepago</span>
                  <span className="text-blue-700">REF {overpay.toFixed(2)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm font-bold mt-1">
                  <span className="text-green-700">Saldado</span>
                  <span className="text-green-700">✓</span>
                </div>
              )}
            </div>

            {/* Method picker (when no pending) */}
            {!pendingMethod && remaining > 0.01 && (
              <div className="grid grid-cols-2 gap-2">
                {MIXED_METHODS.map((m) => (
                  <button key={m.id} onClick={() => startAddPayment(m.id)} disabled={processing}
                    className="flex items-center gap-2 py-3 px-3 rounded-lg border-2 border-stone-200 bg-white text-sm font-medium text-stone-700 hover:border-brand hover:bg-brand/5 transition-all">
                    <span className="text-xl">{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Pending payment input */}
            {pendingMethod && (() => {
              const m = MIXED_METHODS.find((x) => x.id === pendingMethod);
              return (
                <div className="border-2 border-brand/30 rounded-lg p-3 bg-brand/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-brand flex items-center gap-1.5">
                      <span>{m?.icon}</span> {m?.label}
                    </span>
                    <button onClick={cancelAddPayment} className="text-xs text-stone-500 hover:text-stone-700">Cancelar</button>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Monto REF</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      value={pendingAmount}
                      onChange={(e) => setPendingAmount(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-base font-medium focus:border-brand focus:outline-none"
                    />
                  </div>
                  {m?.needsRef && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Referencia</label>
                      <input
                        type="text"
                        value={pendingRef}
                        onChange={(e) => setPendingRef(e.target.value)}
                        placeholder={`Ref. ${m.label}`}
                        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                      />
                    </div>
                  )}
                  <button onClick={commitAddPayment}
                    className="w-full py-2 bg-brand text-white rounded-lg text-sm font-bold hover:bg-brand-dark flex items-center justify-center gap-1.5">
                    <Plus size={14} /> Agregar pago
                  </button>
                </div>
              );
            })()}

            {/* Pagos agregados */}
            {payments.length > 0 && (
              <div className="border-t border-stone-100 pt-3">
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-2">Pagos agregados</p>
                <div className="space-y-1.5">
                  {payments.map((p) => {
                    const m = MIXED_METHODS.find((x) => x.id === p.method);
                    return (
                      <div key={p.tmpId} className="flex items-center gap-2 px-2 py-1.5 bg-stone-50 rounded">
                        <span className="text-base">{m?.icon}</span>
                        <span className="text-sm text-stone-700 flex-1">
                          {m?.label || p.method}
                          {p.reference && <span className="text-stone-400 ml-1">· {p.reference}</span>}
                        </span>
                        <span className="text-sm font-bold text-stone-800">REF {Number(p.amount_ref).toFixed(2)}</span>
                        <button onClick={() => removePayment(p.tmpId)} className="text-stone-400 hover:text-red-500 p-0.5">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Overpay choice */}
            {overpay > 0.01 && (
              <div className="border-t border-stone-100 pt-3 space-y-2">
                <p className="text-xs font-bold text-stone-700">Que hacer con el sobrepago de REF {overpay.toFixed(2)}?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setOverpayAction("change")}
                    className={`py-2 px-3 rounded-lg border-2 text-xs font-bold transition-all ${
                      overpayAction === "change" ? "border-brand bg-brand/5 text-brand" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                    }`}>
                    Dar vuelto
                  </button>
                  <button onClick={() => setOverpayAction("credit")} disabled={!saleClient?.id}
                    className={`py-2 px-3 rounded-lg border-2 text-xs font-bold transition-all disabled:opacity-30 ${
                      overpayAction === "credit" ? "border-brand bg-brand/5 text-brand" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                    }`}>
                    Credito a cuenta
                  </button>
                </div>
                {overpayAction === "change" && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Metodo de devolucion</label>
                    <select
                      value={changeMethod}
                      onChange={(e) => setChangeMethod(e.target.value)}
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      {MIXED_METHODS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {overpayAction === "credit" && saleClient?.id && (
                  <p className="text-xs text-stone-500">Se acreditara REF {overpay.toFixed(2)} a {saleClient.name}.</p>
                )}
                {!saleClient?.id && overpayAction === null && (
                  <p className="text-[11px] text-stone-400 italic">Asocia cliente para opcion "Credito a cuenta"</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* CORTESIA hint */}
        {isCortesia && saleClient?.id && (
          <div className="bg-gold/5 border border-gold/30 rounded-xl p-4 mb-4">
            <p className="text-stone-700 font-medium">
              Vas a regalar REF {totalRef.toFixed(2)} a {(saleClient.name || "").trim().replace(/\s+/g, " ")}.
            </p>
            <p className="text-xs text-stone-500 mt-1">
              No entra dinero a la caja. La venta queda registrada como cortesia. No se otorgan puntos.
            </p>
          </div>
        )}

        {/* CREDIT form */}
        {isCredit && (
          <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4 space-y-3">
            <p className="text-xs font-medium text-stone-500">Seleccionar cliente</p>
            {!useManualClient && (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input type="text" value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setSelectedClient(null); }}
                    placeholder="Buscar por nombre o cedula..."
                    className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                    autoFocus />
                  {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-stone-400" />}
                </div>
                {clients.length > 0 && !selectedClient && (
                  <div className="border border-stone-200 rounded-lg overflow-hidden max-h-48 overflow-auto">
                    {clients.map((c) => (
                      <button key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(""); setClients([]); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-stone-50 border-b border-stone-100 last:border-0 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-stone-700">{(c.full_name || "?").trim().replace(/\s+/g, " ")}</p>
                          {c.cedula && <p className="text-xs text-stone-400">CI: {c.cedula}</p>}
                        </div>
                        {clientDebts[c.id] > 0 && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <AlertCircle size={10} /> Debe REF {clientDebts[c.id].toFixed(2)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedClient && (
                  <div className="bg-brand/5 border border-brand/20 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-brand">{(selectedClient.full_name || "?").trim().replace(/\s+/g, " ")}</p>
                      {selectedClient.cedula && <p className="text-xs text-stone-500">CI: {selectedClient.cedula}</p>}
                      {clientDebts[selectedClient.id] > 0 && (
                        <p className="text-xs text-red-600 mt-0.5">Saldo pendiente: REF {clientDebts[selectedClient.id].toFixed(2)}</p>
                      )}
                    </div>
                    <button onClick={() => { setSelectedClient(null); setClientSearch(""); }} className="text-xs text-stone-400 hover:text-stone-600">Cambiar</button>
                  </div>
                )}
              </>
            )}
            {useManualClient && (
              <div>
                <label className="text-xs text-stone-500 block mb-1">Nombre del cliente</label>
                <input type="text" value={manualClientName}
                  onChange={(e) => setManualClientName(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  autoFocus />
              </div>
            )}
            <button onClick={() => { setUseManualClient(!useManualClient); setSelectedClient(null); setClientSearch(""); setManualClientName(""); }}
              className="text-xs text-brand hover:underline">
              {useManualClient ? "Buscar cliente registrado" : "Cliente no registrado"}
            </button>
            {(selectedClient || (useManualClient && manualClientName.trim())) && (
              <div className="space-y-3 pt-2 border-t border-stone-100">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Fecha limite (opcional)</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Notas (opcional)</label>
                  <input type="text" value={creditNotes} onChange={(e) => setCreditNotes(e.target.value)}
                    placeholder="Notas del credito"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border-t border-stone-200 p-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full py-4 rounded-xl bg-brand text-white font-bold text-base disabled:opacity-30 hover:bg-brand-dark active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {processing ? (
              <><Loader2 size={18} className="animate-spin" /> Procesando...</>
            ) : isCredit ? (
              "Confirmar Credito"
            ) : isCortesia ? (
              "Confirmar Cortesia"
            ) : (
              "Confirmar Venta"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
