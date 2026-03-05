"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, Search, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBs, PAYMENT_METHODS } from "@/lib/utils";

export default function PaymentModal({ cart, rate, processing, onConfirm, onConfirmCredit, onBack }) {
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

  const totalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const hasTasa = !!rate;
  const isCredit = method === "credit";

  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === method);
  const canConfirm = method && !processing && (
    isCredit
      ? (selectedClient || (useManualClient && manualClientName.trim()))
      : (!selectedMethod?.needsRef || reference.trim())
  );

  // Search clients with debounce
  const searchClients = useCallback(async (query) => {
    if (!query || query.length < 2 || !supabase) {
      setClients([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("clients")
      .select("id, first_name, last_name, cedula, phone")
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,cedula.ilike.%${query}%`)
      .limit(10);
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

  const handleConfirm = () => {
    if (isCredit) {
      const clientId = selectedClient?.id || null;
      const clientName = selectedClient
        ? `${selectedClient.first_name} ${selectedClient.last_name}`.trim()
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
        <h2 className="font-bold text-lg text-stone-800">Método de pago</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 max-w-lg mx-auto w-full">
        {/* Order summary */}
        <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
          <p className="text-xs text-stone-500 font-medium mb-2">Resumen de venta</p>
          <div className="space-y-1 mb-3">
            {cart.map((item) => (
              <div key={item.product.id} className="flex justify-between text-sm">
                <span className="text-stone-600">
                  {item.product.emoji || "🍽️"} {item.qty}x {item.product.name}
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
          {PAYMENT_METHODS.map((m) => {
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
            Crédito
          </button>
        </div>

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
              placeholder="Número de referencia"
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
                    placeholder="Buscar por nombre o cédula..."
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
                          <p className="text-sm font-medium text-stone-700">{c.first_name} {c.last_name}</p>
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
                      <p className="text-sm font-medium text-brand">{selectedClient.first_name} {selectedClient.last_name}</p>
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
                  <label className="text-xs text-stone-500 block mb-1">Fecha límite de pago (opcional)</label>
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
                    placeholder="Notas del crédito"
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
              "Confirmar Crédito"
            ) : (
              "Confirmar Venta"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
