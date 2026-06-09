"use client";
import { useState, useEffect, useCallback } from "react";
import { DollarSign, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, METHOD_LABELS } from "@/lib/utils";

const PERIODS = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "custom", label: "Personalizado" },
];

function getPeriodDates(period, customFrom, customTo) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  if (period === "hoy") return { from: todayStr, to: todayStr };
  if (period === "semana") {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    return { from: d.toISOString().split("T")[0], to: todayStr };
  }
  if (period === "mes") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: first.toISOString().split("T")[0], to: todayStr };
  }
  return { from: customFrom || todayStr, to: customTo || todayStr };
}

export default function GastosView({ user, rate }) {
  // Form state
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("REF");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [expDate, setExpDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  // List state
  const [expenses, setExpenses] = useState([]);
  const [period, setPeriod] = useState("mes");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all"); // all | auto | manual
  const [loadingList, setLoadingList] = useState(true);

  const loadExpenses = useCallback(async () => {
    if (!supabase) return;
    const { from, to } = getPeriodDates(period, customFrom, customTo);
    let query = supabase
      .from("cantina_expenses")
      .select("*")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, 1999);
    const { data } = await query;
    if (data) setExpenses(data);
    setLoadingList(false);
  }, [period, customFrom, customTo]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  // Aplico filtro source en cliente (el query trae todo el periodo y permito
  // alternar sin re-query)
  const filteredExpenses = expenses.filter((e) => {
    if (sourceFilter === "all") return true;
    const isAuto = (e.source || "manual").startsWith("auto") || e.source === "legacy";
    return sourceFilter === "auto" ? isAuto : !isAuto;
  });

  const totalRef = filteredExpenses.reduce((s, e) => s + Number(e.amount_ref || 0), 0);
  const autoCount = expenses.filter((e) => (e.source || "").startsWith("auto") || e.source === "legacy").length;
  const manualCount = expenses.length - autoCount;

  const handleSave = async () => {
    if (!category || !description.trim() || !amount || !method) return;
    setSaving(true);

    const amountNum = parseFloat(amount);
    let amountRef = 0, amountBs = null, amountUsd = null;

    // amount_ref es canonical y guarda USD (label histórico "REF").
    if (currency === "REF" || currency === "USD") {
      amountRef = amountNum;
      if (currency === "USD") amountUsd = amountNum;
      if (rate?.usd) amountBs = amountNum * rate.usd;
    } else if (currency === "Bs") {
      amountBs = amountNum;
      amountRef = rate?.usd ? amountNum / rate.usd : 0;
    }

    try {
      const { error } = await supabase.from("cantina_expenses").insert({
        id: "cex_mn_" + Math.random().toString(36).slice(2, 14),
        expense_date: expDate,
        category,
        description: description.trim(),
        amount_ref: amountRef,
        amount_bs: amountBs,
        amount_usd: amountUsd,
        payment_method: method,
        reference: reference || null,
        exchange_rate_bs: rate?.eur || null,
        created_by: user?.name || "Cantina",
        source: "manual",
      });
      if (error) throw error;

      // Reset form
      setCategory("");
      setDescription("");
      setAmount("");
      setReference("");
      await loadExpenses();
    } catch (err) {
      alert("Error: " + err.message);
    }
    setSaving(false);
  };

  const selectedPayMethod = PAYMENT_METHODS.find((m) => m.id === method);

  // Category summary
  const catTotals = {};
  filteredExpenses.forEach((e) => {
    catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount_ref || 0);
  });
  const maxCat = Math.max(...Object.values(catTotals), 1);

  const SOURCE_LABEL = {
    auto_restock: { txt: "Auto · Restock",  color: "bg-blue-50 text-blue-700 border-blue-200" },
    auto_payable: { txt: "Auto · Por pagar",color: "bg-blue-50 text-blue-700 border-blue-200" },
    auto_product: { txt: "Auto · Producto", color: "bg-blue-50 text-blue-700 border-blue-200" },
    legacy:       { txt: "Histórico",       color: "bg-stone-100 text-stone-600 border-stone-300" },
    manual:       { txt: "Manual",          color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <h1 className="font-bold text-brand text-lg flex items-center gap-2">
        <DollarSign size={20} /> Gastos
      </h1>

      {/* New expense form */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
        <h2 className="font-bold text-sm text-stone-700">Nuevo gasto</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Categoría *</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none">
              <option value="">Seleccionar...</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Descripcion *</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalle del gasto" className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Monto *</label>
            <div className="flex gap-1">
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-2 text-sm focus:border-brand focus:outline-none">
                <option>REF</option>
                <option>Bs</option>
                <option>USD</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Metodo de pago *</label>
            <select value={method} onChange={(e) => { setMethod(e.target.value); setReference(""); }}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none">
              <option value="">Seleccionar...</option>
              {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-stone-500 block mb-1">Fecha</label>
            <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>
        </div>

        {selectedPayMethod?.needsRef && (
          <div>
            <label className="text-xs text-stone-500 block mb-1">Referencia</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Numero de referencia" className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          </div>
        )}

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving || !category || !description.trim() || !amount || !method}
            className="px-5 py-2 bg-brand text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-brand-dark flex items-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : "Guardar gasto"}
          </button>
        </div>
      </div>

      {/* Period + source filter */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Periodo</span>
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p.id ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}>{p.label}</button>
          ))}
          {period === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-1 text-xs" />
              <span className="text-xs text-stone-400">—</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-1 text-xs" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Origen</span>
          {[
            { id: "all",    label: `Todos (${expenses.length})` },
            { id: "auto",   label: `Auto (${autoCount})` },
            { id: "manual", label: `Manual (${manualCount})` },
          ].map((s) => (
            <button key={s.id} onClick={() => setSourceFilter(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sourceFilter === s.id ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Expense list */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        {loadingList ? (
          <p className="p-4 text-sm text-stone-400 animate-pulse">Cargando...</p>
        ) : filteredExpenses.length === 0 ? (
          <p className="p-4 text-sm text-stone-400 text-center">
            {expenses.length === 0 ? "Sin gastos en este periodo" : "Sin resultados con el filtro de origen aplicado"}
          </p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium">Fecha</th>
                <th className="text-left px-3 py-2 font-medium">Categoría</th>
                <th className="text-left px-3 py-2 font-medium">Descripción</th>
                <th className="text-left px-3 py-2 font-medium">Origen</th>
                <th className="text-right px-3 py-2 font-medium">REF</th>
                <th className="text-left px-3 py-2 font-medium">Método</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((e) => {
                const src = SOURCE_LABEL[e.source] || SOURCE_LABEL.manual;
                return (
                  <tr key={e.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                    <td className="px-3 py-2 text-stone-500 whitespace-nowrap">{new Date(e.expense_date + "T12:00:00").toLocaleDateString("es-VE")}</td>
                    <td className="px-3 py-2 text-stone-700">{e.category}</td>
                    <td className="px-3 py-2 text-stone-600">{e.description}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${src.color}`}>{src.txt}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">${Number(e.amount_ref || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-stone-500 whitespace-nowrap">{METHOD_LABELS[e.payment_method] || e.payment_method}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-200 bg-stone-50">
                <td colSpan={4} className="px-3 py-2 text-right font-bold text-sm text-stone-700">
                  Total {filteredExpenses.length} gasto{filteredExpenses.length === 1 ? "" : "s"}:
                </td>
                <td className="px-3 py-2 text-right font-bold text-sm text-brand">${totalRef.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table></div>
        )}
      </div>

      {/* Category breakdown */}
      {Object.keys(catTotals).length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <h3 className="font-bold text-xs text-stone-500 mb-3">Gastos por categoría</h3>
          <div className="space-y-2">
            {Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-stone-600 w-44 shrink-0 truncate">{cat}</span>
                <div className="flex-1 bg-stone-100 rounded-full h-4 overflow-hidden">
                  <div className="bg-brand h-4 rounded-full transition-all" style={{ width: `${(total / maxCat) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-stone-700 w-24 text-right">${total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
