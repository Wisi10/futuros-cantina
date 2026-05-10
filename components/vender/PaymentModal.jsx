"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, Search, AlertCircle, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBs, PAYMENT_METHODS, ProductImage } from "@/lib/utils";
import ClientLink from "@/components/shared/ClientLink";

export default function PaymentModal({ cart, rate, processing, saleClient, userRole, onAssociateClient, onConfirm, onConfirmCredit, onBack }) {
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");

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

  // Loyalty client picker (separado del credit search — para asociar saleClient y acumular puntos)
  const [loyaltyPickerOpen, setLoyaltyPickerOpen] = useState(false);
  const [loyaltySearch, setLoyaltySearch] = useState("");
  const [loyaltyResults, setLoyaltyResults] = useState([]);
  const [loyaltySearching, setLoyaltySearching] = useState(false);
  const [loyaltyAttaching, setLoyaltyAttaching] = useState(false);

  const totalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const hasTasa = !!rate;
  const isCredit = method === "credit";

  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === method);
  const isCortesia = method === "cortesia";
  const canConfirm = method && !processing && (
    isCredit
      ? (selectedClient || (useManualClient && manualClientName.trim()))
      : isCortesia
      ? !!saleClient?.id
      : (!selectedMethod?.needsRef || reference.trim())
  );

  // Search clients with debounce — uses search_clients RPC (SECURITY DEFINER, Sprint 3)
  const searchClients = useCallback(async (query) => {
    if (!query || query.length < 2 || !supabase) {
      setClients([]);
      return;
    }
    setSearching(true);
    let data = [];
    try {
      const res = await supabase.rpc("search_clients", { query });
      data = res.data || [];
    } catch (e) {
      console.error("[CREDIT SEARCH] error:", e);
    }
    if (data) {
      setClients(data);
      // Load debts for these clients
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
            const outstanding = Number(c.original_amount_ref) - Number(c.paid_amount_ref || 0);
            debts[c.client_id] = (debts[c.client_id] || 0) + outstanding;
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

  // Loyalty picker: reusa search_clients RPC (mismo patron que ClientModal)
  const searchLoyaltyClients = useCallback(async (query) => {
    if (!query || query.length < 2 || !supabase) {
      setLoyaltyResults([]);
      setLoyaltySearching(false);
      return;
    }
    setLoyaltySearching(true);
    try {
      const { data } = await supabase.rpc("search_clients", { query });
      setLoyaltyResults(data || []);
    } catch (e) {
      console.error("[LOYALTY PICKER] search error:", e);
      setLoyaltyResults([]);
    }
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
    } catch (e) {
      console.error("[LOYALTY PICKER] attach error:", e);
      onAssociateClient({
        id: c.id,
        name: c.full_name || "Cliente",
        cedula: c.cedula || null,
        points: 0,
      });
    }
    setLoyaltyPickerOpen(false);
    setLoyaltySearch("");
    setLoyaltyResults([]);
    setLoyaltyAttaching(false);
  };

  const detachLoyaltyClient = () => {
    if (onAssociateClient) onAssociateClient(null);
    setLoyaltyPickerOpen(false);
    setLoyaltySearch("");
    setLoyaltyResults([]);
  };

  const handleConfirm = () => {
    if (isCredit) {
      const clientId = selectedClient?.id || null;
      const clientName = selectedClient
        ? (selectedClient.full_name || "").trim().replace(/\s+/g, " ")
        : manualClientName.trim();
      onConfirmCredit({ clientId, clientName, notes: creditNotes, dueDate: dueDate || null });
    } else {
      onConfirm(method, reference);
    }
  };

  return (
    <div className="fixed inset-0 bg-brand-cream-light z-40 flex flex-col">
      <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} disabled={processing} className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 disabled:opacity-30">
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-bold text-lg text-stone-800">Metodo de pago</h2>
      </div>

      {/* Loyalty client picker — al tope del modal */}
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
                <button onClick={() => { onAssociateClient(null); setLoyaltyPickerOpen(true); }}
                  className="text-xs text-brand hover:underline">Cambiar</button>
                <button onClick={detachLoyaltyClient}
                  className="text-xs text-stone-400 hover:text-red-500">Quitar</button>
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
                <p className="text-xs text-stone-400 text-center py-2">
                  Sin resultados — el cliente debe estar registrado en futuros-demo primero
                </p>
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

        {/* Payment methods */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {PAYMENT_METHODS.filter((m) => !m.adminOnly).map((m) => {
            const active = method === m.id;
            return (
              <button
                key={m.id}
                onClick={() => { setMethod(m.id); setReference(""); setSelectedClient(null); setUseManualClient(false); }}
                disabled={processing}
                className={`flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 font-medium text-sm transition-all active:scale-[0.97] ${
                  active
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                }`}
              >
                <span className="text-2xl">{m.icon}</span>
                {m.label}
              </button>
            );
          })}
          {/* Credit */}
          <button
            onClick={() => { setMethod("credit"); setReference(""); }}
            disabled={processing}
            className={`flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 font-medium text-sm transition-all active:scale-[0.97] col-span-2 ${
              isCredit
                ? "border-brand bg-brand/5 text-brand"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
            }`}
          >
            <span className="text-2xl">📋</span>
            Credito
          </button>

          {/* Cortesia (admin only, requires saleClient) */}
          {userRole === "admin" && (
            <button
              onClick={() => {
                if (!saleClient?.id) {
                  alert("Asocia un cliente antes de dar cortesia.");
                  return;
                }
                setMethod("cortesia"); setReference(""); setSelectedClient(null); setUseManualClient(false);
              }}
              disabled={processing}
              className={`flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 font-medium text-sm transition-all active:scale-[0.97] col-span-2 ${
                method === "cortesia"
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-gold/40 bg-white text-stone-600 hover:border-gold/60"
              }`}
            >
              <span className="text-2xl">🎁</span>
              Cortesia
              <span className="text-[10px] text-stone-400">
                {saleClient?.id ? `Para ${(saleClient.name || "").trim().replace(/\s+/g, " ")}` : "(asocia cliente primero)"}
              </span>
            </button>
          )}
        </div>

        {/* Cortesia confirmation hint */}
        {method === "cortesia" && saleClient?.id && (
          <div className="bg-gold/5 border border-gold/30 rounded-xl p-3 mb-4 text-sm">
            <p className="text-stone-700 font-medium">
              Vas a regalar REF {totalRef.toFixed(2)} a {(saleClient.name || "").trim().replace(/\s+/g, " ")}.
            </p>
            <p className="text-xs text-stone-500 mt-1">
              No entra dinero a la caja. La venta queda registrada como cortesia.
              No se otorgan puntos de loyalty.
            </p>
          </div>
        )}

        {/* Reference field for regular methods */}
        {selectedMethod?.needsRef && (
          <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
            <label className="text-xs font-medium text-stone-500 block mb-1.5">
              Referencia ({selectedMethod.label})
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Numero de referencia"
              className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              autoFocus
            />
          </div>
        )}

        {/* Credit: client search */}
        {isCredit && (
          <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4 space-y-3">
            <p className="text-xs font-medium text-stone-500">Seleccionar cliente</p>

            {!useManualClient && (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => { setClientSearch(e.target.value); setSelectedClient(null); }}
                    placeholder="Buscar por nombre o cedula..."
                    className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                    autoFocus
                  />
                  {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-stone-400" />}
                </div>

                {/* Client results */}
                {clients.length > 0 && !selectedClient && (
                  <div className="border border-stone-200 rounded-lg overflow-hidden max-h-48 overflow-auto">
                    {clients.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedClient(c); setClientSearch(""); setClients([]); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-stone-50 border-b border-stone-100 last:border-0 flex items-center justify-between"
                      >
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

                {/* Selected client */}
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

            {/* Manual client option */}
            {useManualClient && (
              <div>
                <label className="text-xs text-stone-500 block mb-1">Nombre del cliente</label>
                <input
                  type="text"
                  value={manualClientName}
                  onChange={(e) => setManualClientName(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
                  autoFocus
                />
              </div>
            )}

            <button
              onClick={() => { setUseManualClient(!useManualClient); setSelectedClient(null); setClientSearch(""); setManualClientName(""); }}
              className="text-xs text-brand hover:underline"
            >
              {useManualClient ? "Buscar cliente registrado" : "Cliente no registrado"}
            </button>

            {/* Due date and notes */}
            {(selectedClient || (useManualClient && manualClientName.trim())) && (
              <div className="space-y-3 pt-2 border-t border-stone-100">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Fecha limite de pago (opcional)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 block mb-1">Notas (opcional)</label>
                  <input
                    type="text"
                    value={creditNotes}
                    onChange={(e) => setCreditNotes(e.target.value)}
                    placeholder="Notas del credito"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  />
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
