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
  const [period, setPeriod] = useState("hoy");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  const loadExpenses = useCallback(async () => {
    if (!supabase) return;
    const { from, to } = getPeriodDates(period, customFrom, customTo);
    const { data } = await supabase
      .from("cantina_expenses")
      .select("*")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("created_at", { ascending: false });
    if (data) setExpenses(data);
    setLoadingList(false);
  }, [period, customFrom, customTo]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const totalRef = expenses.reduce((s, e) => s + Number(e.amount_ref || 0), 0);

  const handleSave = async () => {
    if (!category || !description.trim() || !amount || !method) return;
    setSaving(true);

    const amountNum = parseFloat(amount);
    let amountRef = 0, amountBs = null, amountUsd = null;

    if (currency === "REF") {
      amountRef = amountNum;
      if (rate?.eur) amountBs = amountNum * rate.eur;
    } else if (currency === "Bs") {
      amountBs = amountNum;
      amountRef = rate?.eur ? amountNum / rate.eur : 0;
    } else if (currency === "USD") {
      amountUsd = amountNum;
      // rate.eur = Bs per 1 REF, rate.usd = Bs per 1 USD
      // USD→REF: (amountUsd * bsPerUsd) / bsPerRef
      amountRef = (rate?.eur && rate?.usd) ? amountNum * (rate.usd / rate.eur) : 0;
    }

    try {
      const { error } = await supabase.from("cantina_expenses").insert({
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
  expenses.forEach((e) => {
    catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount_ref || 0);
  });
  const maxCat = Math.max(...Object.values(catTotals), 1);

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <h1 className="font-bold text-brand text-lg flex items-center gap-2">
        <DollarSign size={20} /> Gastos
      </h1>

      {/* New expense form */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
        <h2 className="font-bold text-sm text-stone-700">Nuevo gasto</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-stone-500 block mb-1">Categoria *</label>
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

        <div className="grid grid-cols-3 gap-3">
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

      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
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

      {/* Expense list */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        {loadingList ? (
          <p className="p-4 text-sm text-stone-400 animate-pulse">Cargando...</p>
        ) : expenses.length === 0 ? (
          <p className="p-4 text-sm text-stone-400 text-center">Sin gastos en este periodo</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 text-stone-500 text-xs">
                <th className="text-left px-3 py-2 font-medium">Fecha</th>
                <th className="text-left px-3 py-2 font-medium">Categoria</th>
                <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                <th className="text-right px-3 py-2 font-medium">REF</th>
                <th className="text-right px-3 py-2 font-medium">Original</th>
                <th className="text-left px-3 py-2 font-medium">Metodo</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                  <td className="px-3 py-2 text-stone-500">{new Date(e.expense_date + "T12:00:00").toLocaleDateString("es-VE")}</td>
                  <td className="px-3 py-2">{e.category}</td>
                  <td className="px-3 py-2 text-stone-600">{e.description}</td>
                  <td className="px-3 py-2 text-right font-medium">REF {Number(e.amount_ref || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-stone-400">
                    {e.amount_bs ? `Bs ${Number(e.amount_bs).toFixed(2)}` : e.amount_usd ? `USD ${Number(e.amount_usd).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-stone-500">{METHOD_LABELS[e.payment_method] || e.payment_method}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-200 bg-stone-50">
                <td colSpan={3} className="px-3 py-2 text-right font-bold text-sm text-stone-700">Total:</td>
                <td className="px-3 py-2 text-right font-bold text-sm text-brand">REF {totalRef.toFixed(2)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Category breakdown */}
      {Object.keys(catTotals).length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <h3 className="font-bold text-xs text-stone-500 mb-3">Gastos por categoria</h3>
          <div className="space-y-2">
            {Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-stone-600 w-44 shrink-0 truncate">{cat}</span>
                <div className="flex-1 bg-stone-100 rounded-full h-4 overflow-hidden">
                  <div className="bg-brand h-4 rounded-full transition-all" style={{ width: `${(total / maxCat) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-stone-700 w-24 text-right">REF {total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
