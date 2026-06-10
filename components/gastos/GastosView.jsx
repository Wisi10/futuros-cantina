"use client";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Edit3, X, Save, DollarSign, Receipt, TrendingDown, TrendingUp,
  BarChart3, List, Download, Calendar, Tag, CreditCard, ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, METHOD_LABELS } from "@/lib/utils";
import { exportExpensesToCSV } from "@/lib/csv";

const EXPENSE_TYPES = [
  { id: "fijo",     name: "Gasto Fijo" },
  { id: "variable", name: "Gasto Variable" },
];

const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const todayStr = () => new Date().toISOString().split("T")[0];

const INITIAL_FORM = {
  expense_type: "variable",
  category: EXPENSE_CATEGORIES[0],
  description: "",
  amount_ref: "",
  payment_method: "transferencia",
  reference: "",
  expense_date: todayStr(),
};

// Calcula el rango [start, end) según preset. monthOffset solo aplica con period='month'.
function getPeriodRange(period, customStart, customEnd, monthOffset) {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: d, end: new Date(d.getTime() + 86400000) };
  }
  if (period === "week") {
    const day = now.getDay();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day === 0 ? 6 : day - 1));
    return { start: monday, end: new Date(monday.getTime() + 7 * 86400000) };
  }
  if (period === "month") {
    const y = now.getFullYear();
    const m = now.getMonth() + monthOffset;
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  }
  if (period === "year") {
    return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
  }
  if (period === "custom" && customStart && customEnd) {
    return {
      start: new Date(customStart + "T00:00:00"),
      end: new Date(new Date(customEnd + "T00:00:00").getTime() + 86400000),
    };
  }
  return { start: new Date(0), end: new Date(8640000000000000) };
}

export default function GastosView({ user, rate }) {
  const isAdmin = user?.cantinaRole === "admin" || user?.role === "admin" || user?.role === "owner";

  // Data
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // View
  const [viewMode, setViewMode] = useState("dashboard");

  // Filters
  const [period, setPeriod] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [monthOffset, setMonthOffset] = useState(0);

  const [categoryModal, setCategoryModal] = useState(null);

  // Load — single fetch al montar, refetch tras mutaciones. range(0, 4999) para
  // bypass del cap de PostgREST (886+ filas históricas + nuevas).
  const loadExpenses = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("cantina_expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .range(0, 4999);
    if (data) setExpenses(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  // Range
  const { start, end } = useMemo(
    () => getPeriodRange(period, customStart, customEnd, monthOffset),
    [period, customStart, customEnd, monthOffset]
  );

  const isCurrentMonth = period === "month" && monthOffset === 0;
  const monthLabel = useMemo(() => {
    if (period !== "month") return "";
    return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
  }, [period, start]);

  const handleSetPeriod = (p) => {
    if (p !== "month") setMonthOffset(0);
    setPeriod(p);
  };

  // Filtered (period + type + category)
  const filtered = useMemo(() => {
    return expenses
      .filter((e) => {
        const d = new Date(e.expense_date + "T12:00:00");
        if (d < start || d >= end) return false;
        if (filterType !== "all" && e.expense_type !== filterType) return false;
        if (filterCategory !== "all" && e.category !== filterCategory) return false;
        return true;
      })
      .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
  }, [expenses, start, end, filterType, filterCategory]);

  // Totals
  const periodTotals = useMemo(() => {
    const totalRef = filtered.reduce((s, e) => s + Number(e.amount_ref || 0), 0);
    const totalBs = filtered.reduce((s, e) => {
      const bs = Number(e.amount_bs || 0);
      if (bs > 0) return s + bs;
      // amount_ref está en USD en cantina → multiplicar por rate.usd (Bs/USD).
      return s + Number(e.amount_ref || 0) * (rate?.usd || 0);
    }, 0);
    return { totalRef, totalBs, count: filtered.length };
  }, [filtered, rate]);

  const daysInPeriod = useMemo(() => Math.max(1, Math.round((end - start) / 86400000)), [start, end]);
  const avgDaily = periodTotals.totalRef / daysInPeriod;

  // Fijo vs variable
  const typeSplit = useMemo(() => {
    const fijo = filtered.filter((e) => e.expense_type === "fijo");
    const variable = filtered.filter((e) => e.expense_type === "variable");
    return {
      fijo: { total: fijo.reduce((s, e) => s + Number(e.amount_ref || 0), 0), count: fijo.length },
      variable: { total: variable.reduce((s, e) => s + Number(e.amount_ref || 0), 0), count: variable.length },
    };
  }, [filtered]);

  // Periodo anterior (respeta filtros activos)
  const prevRange = useMemo(() => {
    if (period === "today") return { start: new Date(start.getTime() - 86400000), end: new Date(start) };
    if (period === "week") return { start: new Date(start.getTime() - 7 * 86400000), end: new Date(start) };
    if (period === "month") return { start: new Date(start.getFullYear(), start.getMonth() - 1, 1), end: new Date(start.getFullYear(), start.getMonth(), 1) };
    if (period === "year") return { start: new Date(start.getFullYear() - 1, 0, 1), end: new Date(start.getFullYear(), 0, 1) };
    return null;
  }, [period, start]);

  const prevExpenses = useMemo(() => {
    if (!prevRange) return [];
    return expenses.filter((e) => {
      const d = new Date(e.expense_date + "T12:00:00");
      if (d < prevRange.start || d >= prevRange.end) return false;
      if (filterType !== "all" && e.expense_type !== filterType) return false;
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      return true;
    });
  }, [expenses, prevRange, filterType, filterCategory]);

  const prevTotal = useMemo(() => prevExpenses.reduce((s, e) => s + Number(e.amount_ref || 0), 0), [prevExpenses]);
  const periodChange = (periodTotals.totalRef > 0 || prevTotal > 0)
    ? ((periodTotals.totalRef - prevTotal) / (prevTotal || 1)) * 100
    : 0;

  const prevMonthLabel = useMemo(() => {
    if (period !== "month") return "";
    const d = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }, [period, start]);

  // Año anterior (solo period=month)
  const yearAgoRange = useMemo(() => {
    if (period !== "month") return null;
    return {
      start: new Date(start.getFullYear() - 1, start.getMonth(), 1),
      end: new Date(start.getFullYear() - 1, start.getMonth() + 1, 1),
    };
  }, [period, start]);

  const yearAgoExpenses = useMemo(() => {
    if (!yearAgoRange) return [];
    return expenses.filter((e) => {
      const d = new Date(e.expense_date + "T12:00:00");
      if (d < yearAgoRange.start || d >= yearAgoRange.end) return false;
      if (filterType !== "all" && e.expense_type !== filterType) return false;
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      return true;
    });
  }, [expenses, yearAgoRange, filterType, filterCategory]);

  const yearAgoTotal = useMemo(() => yearAgoExpenses.reduce((s, e) => s + Number(e.amount_ref || 0), 0), [yearAgoExpenses]);
  const yearAgoChange = (periodTotals.totalRef > 0 || yearAgoTotal > 0)
    ? ((periodTotals.totalRef - yearAgoTotal) / (yearAgoTotal || 1)) * 100
    : 0;
  const yearAgoLabel = useMemo(() => {
    if (period !== "month") return "";
    const d = new Date(start.getFullYear() - 1, start.getMonth(), 1);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }, [period, start]);

  // Categorías + métodos pago
  const byCategory = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const cat = e.category || "Otros";
      if (!map[cat]) map[cat] = { name: cat, total: 0, count: 0 };
      map[cat].total += Number(e.amount_ref || 0);
      map[cat].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const byPaymentMethod = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const pm = e.payment_method || "otro";
      if (!map[pm]) map[pm] = { id: pm, name: METHOD_LABELS[pm] || pm, total: 0, count: 0 };
      map[pm].total += Number(e.amount_ref || 0);
      map[pm].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const expensesByCategory = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const cat = e.category || "Otros";
      if (!map[cat]) map[cat] = { category: cat, items: [], total: 0 };
      map[cat].items.push(e);
      map[cat].total += Number(e.amount_ref || 0);
    });
    return Object.values(map)
      .map((g) => ({ ...g, items: [...g.items].sort((a, b) => Number(b.amount_ref || 0) - Number(a.amount_ref || 0)) }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Tendencia mensual (year view)
  const monthlyTrend = useMemo(() => {
    if (period !== "year") return [];
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i, label: MONTH_NAMES[i], total: 0 }));
    const yr = start.getFullYear();
    expenses.forEach((e) => {
      const d = new Date(e.expense_date + "T12:00:00");
      if (d.getFullYear() !== yr) return;
      if (filterType !== "all" && e.expense_type !== filterType) return;
      if (filterCategory !== "all" && e.category !== filterCategory) return;
      months[d.getMonth()].total += Number(e.amount_ref || 0);
    });
    return months;
  }, [expenses, period, start, filterType, filterCategory]);

  const maxMonthTotal = useMemo(() => Math.max(...monthlyTrend.map((m) => m.total), 1), [monthlyTrend]);

  // Form
  const resetForm = () => {
    setForm({ ...INITIAL_FORM, expense_date: todayStr() });
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (expense) => {
    setEditing(expense);
    setForm({
      expense_type: expense.expense_type || "variable",
      category: expense.category || EXPENSE_CATEGORIES[0],
      description: expense.description || "",
      amount_ref: expense.amount_ref?.toString() || "",
      payment_method: expense.payment_method || "transferencia",
      reference: expense.reference || "",
      expense_date: expense.expense_date || todayStr(),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.description.trim()) { alert("La descripción es obligatoria"); return; }
    const amountRef = parseFloat(form.amount_ref);
    if (!amountRef || amountRef <= 0) { alert("Ingresa un monto válido"); return; }
    setSaving(true);
    // amount_ref está en USD (cantina). Para Bs hay que multiplicar por rate.usd (Bs/USD), no rate.eur.
    const rateBs = rate?.usd || null;
    const record = {
      expense_type: form.expense_type,
      category: form.category,
      description: form.description.trim(),
      amount_ref: amountRef,
      amount_bs: rateBs ? amountRef * rateBs : null,
      exchange_rate_bs: rateBs,
      payment_method: form.payment_method,
      reference: form.reference.trim() || null,
      expense_date: form.expense_date,
      created_by: user?.name || "Cantina",
      source: editing ? (editing.source || "manual") : "manual",
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("cantina_expenses").update(record).eq("id", editing.id));
    } else {
      record.id = "cex_mn_" + Math.random().toString(36).slice(2, 14);
      ({ error } = await supabase.from("cantina_expenses").insert(record));
    }
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    resetForm();
    loadExpenses();
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from("cantina_expenses").delete().eq("id", id);
    if (error) { alert("Error: " + error.message); return; }
    setConfirmDelete(null);
    loadExpenses();
  };

  const handleExport = () => {
    const tag = period === "month" ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`
              : period === "year"  ? `${start.getFullYear()}`
              : todayStr();
    exportExpensesToCSV(filtered, `gastos-cantina-${period}-${tag}`);
  };

  const amountBsPreview = (parseFloat(form.amount_ref) || 0) * (rate?.usd || 0);

  const periods = [
    { id: "today",  label: "Hoy" },
    { id: "week",   label: "Semana" },
    { id: "month",  label: "Mes" },
    { id: "year",   label: "Año" },
    { id: "custom", label: "Personalizado" },
  ];

  const periodComparisonLabel = {
    today: "vs ayer",
    week:  "vs semana anterior",
    month: "vs mes anterior",
    year:  "vs año anterior",
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Receipt size={20} className="text-brand" /> Gastos
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-stone-100 hover:bg-stone-200 text-stone-600 disabled:opacity-40">
              <Download size={14} /> Exportar CSV
            </button>
            <button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showForm ? "bg-stone-200 hover:bg-stone-300 text-stone-700" : "bg-brand hover:bg-brand-dark text-white"
              }`}>
              {showForm ? <><X size={14} /> Cancelar</> : <><Plus size={14} /> Nuevo Gasto</>}
            </button>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-stone-700 uppercase">
              {editing ? "Editar gasto" : "Registrar nuevo gasto"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1 block">Tipo</label>
                <select value={form.expense_type} onChange={(e) => setForm({ ...form, expense_type: e.target.value })}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm">
                  {EXPENSE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1 block">Categoría</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm">
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-stone-500 mb-1 block">Descripción *</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ej: Recarga de gas para cocina"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1 block">Método de pago</label>
                <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm">
                  {PAYMENT_METHODS.filter((m) => m.id !== "cortesia").map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1 block">Monto (REF) *</label>
                <input type="number" step="0.01" value={form.amount_ref}
                  onChange={(e) => setForm({ ...form, amount_ref: e.target.value })}
                  placeholder="0.00"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                {parseFloat(form.amount_ref) > 0 && rate?.usd && (
                  <p className="text-xs text-stone-400 mt-1">
                    = Bs. {amountBsPreview.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-stone-300 ml-1">(tasa: {rate.usd})</span>
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1 block">Fecha</label>
                <input type="date" value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1 block">Referencia (opcional)</label>
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  placeholder="Nº de comprobante / factura"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={resetForm} className="flex-1 py-2.5 bg-stone-200 hover:bg-stone-300 rounded-lg text-sm font-medium">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                <Save size={14} /> {saving ? "Guardando..." : editing ? "Actualizar gasto" : "Registrar gasto"}
              </button>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          {periods.map((p) => (
            <button key={p.id} onClick={() => handleSetPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p.id ? "bg-brand text-white" : "bg-stone-100 hover:bg-stone-200 text-stone-600"
              }`}>
              {p.label}
            </button>
          ))}
          {period === "month" && (
            <div className="flex items-center gap-1 ml-2 bg-stone-50 border border-stone-200 rounded-lg px-1.5 py-1">
              <button onClick={() => setMonthOffset(monthOffset - 1)}
                className="px-2 py-0.5 text-stone-600 hover:bg-stone-200 rounded text-sm">◀</button>
              <span className="text-sm font-medium text-stone-700 min-w-[7rem] text-center capitalize">{monthLabel}</span>
              <button onClick={() => !isCurrentMonth && setMonthOffset(monthOffset + 1)} disabled={isCurrentMonth}
                className={`px-2 py-0.5 rounded text-sm ${isCurrentMonth ? "text-stone-300 cursor-not-allowed" : "text-stone-600 hover:bg-stone-200"}`}>▶</button>
              {!isCurrentMonth && (
                <button onClick={() => setMonthOffset(0)} className="ml-1 px-2 py-0.5 text-xs text-brand hover:bg-stone-200 rounded">
                  Hoy
                </button>
              )}
            </div>
          )}
          {period === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-1 text-sm" />
              <span className="text-stone-400">→</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-stone-300 rounded-lg px-2 py-1 text-sm" />
            </div>
          )}
          <div className="ml-auto flex gap-2 flex-wrap">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="all">Todos los tipos</option>
              {EXPENSE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="border border-stone-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="all">Todas las categorías</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex bg-stone-100 rounded-lg p-0.5">
              <button onClick={() => setViewMode("dashboard")}
                className={`px-2.5 py-1 rounded-md text-sm ${viewMode === "dashboard" ? "bg-white shadow-sm text-stone-800" : "text-stone-500"}`}>
                <BarChart3 size={14} />
              </button>
              <button onClick={() => setViewMode("list")}
                className={`px-2.5 py-1 rounded-md text-sm ${viewMode === "list" ? "bg-white shadow-sm text-stone-800" : "text-stone-500"}`}>
                <List size={14} />
              </button>
            </div>
          </div>
        </div>

        {loading && <p className="text-sm text-stone-400 animate-pulse">Cargando...</p>}

        {/* ═════ DASHBOARD ═════ */}
        {viewMode === "dashboard" && !loading && (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-stone-500 uppercase font-medium">Total Gastos</p>
                  <DollarSign size={14} className="text-red-400" />
                </div>
                <p className="text-2xl font-bold text-red-600">REF {periodTotals.totalRef.toFixed(2)}</p>
                <p className="text-xs text-stone-400 mt-0.5">
                  Bs. {periodTotals.totalBs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-stone-500 uppercase font-medium">Promedio Diario</p>
                  <Calendar size={14} className="text-stone-400" />
                </div>
                <p className="text-2xl font-bold text-stone-700">REF {avgDaily.toFixed(2)}</p>
                <p className="text-xs text-stone-400 mt-0.5">{daysInPeriod} días en periodo</p>
              </div>
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-stone-500 uppercase font-medium">Gastos Fijos</p>
                  <span className="text-xs font-bold text-brand">
                    {periodTotals.totalRef > 0 ? ((typeSplit.fijo.total / periodTotals.totalRef) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-brand">REF {typeSplit.fijo.total.toFixed(2)}</p>
                <p className="text-xs text-stone-400 mt-0.5">{typeSplit.fijo.count} gastos</p>
              </div>
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-stone-500 uppercase font-medium">Gastos Variables</p>
                  <span className="text-xs font-bold text-stone-600">
                    {periodTotals.totalRef > 0 ? ((typeSplit.variable.total / periodTotals.totalRef) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-stone-600">REF {typeSplit.variable.total.toFixed(2)}</p>
                <p className="text-xs text-stone-400 mt-0.5">{typeSplit.variable.count} gastos</p>
              </div>
            </div>

            {/* Comparativas mes */}
            {period === "month" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {[
                  { label: "vs Mes Anterior", sub: prevMonthLabel, total: prevTotal, change: periodChange, n: prevExpenses.length },
                  { label: "vs Mismo Mes Año Pasado", sub: yearAgoLabel, total: yearAgoTotal, change: yearAgoChange, n: yearAgoExpenses.length },
                ].map((c, i) => {
                  const hasData = c.n > 0;
                  const up = c.change > 0;
                  const dn = c.change < 0;
                  return (
                    <div key={i} className="bg-white rounded-lg border border-stone-200 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-stone-500 uppercase font-medium">{c.label}</p>
                        <p className="text-xs text-stone-400 capitalize">{c.sub}</p>
                      </div>
                      {hasData ? (
                        <div className="flex items-baseline justify-between mt-1">
                          <p className="text-xl font-bold text-stone-700">REF {c.total.toFixed(2)}</p>
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                            up ? "bg-red-50 text-red-600" : dn ? "bg-green-50 text-green-600" : "bg-stone-50 text-stone-500"
                          }`}>
                            {up ? "▲" : dn ? "▼" : "="} {Math.abs(c.change).toFixed(1)}%
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-baseline justify-between mt-1">
                          <p className="text-xl font-bold text-stone-300">—</p>
                          <p className="text-xs text-stone-400">Sin data</p>
                        </div>
                      )}
                      <p className="text-xs text-stone-400 mt-0.5">{hasData ? `${c.n} gastos` : ""}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Comparativa periodos simples */}
            {period !== "custom" && period !== "month" && (
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-stone-500 uppercase font-medium mb-1">Comparación de Periodo</p>
                    <p className="text-sm text-stone-600">{periodComparisonLabel[period] || ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-stone-400">Periodo anterior</p>
                      <p className="text-sm font-medium text-stone-600">REF {prevTotal.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-stone-400">Periodo actual</p>
                      <p className="text-sm font-medium text-stone-800">REF {periodTotals.totalRef.toFixed(2)}</p>
                    </div>
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${
                      periodChange > 0 ? "bg-red-50 text-red-600" : periodChange < 0 ? "bg-green-50 text-green-600" : "bg-stone-50 text-stone-500"
                    }`}>
                      {periodChange > 0 ? <TrendingUp size={14} /> : periodChange < 0 ? <TrendingDown size={14} /> : null}
                      {periodChange > 0 ? "+" : ""}{periodChange.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-sm font-bold text-stone-700 mb-3 flex items-center gap-2">
                  <Tag size={14} className="text-stone-400" /> Por Categoría
                </h3>
                {byCategory.length > 0 ? (
                  <div className="space-y-2.5">
                    {byCategory.map((cat) => {
                      const pct = periodTotals.totalRef > 0 ? (cat.total / periodTotals.totalRef * 100) : 0;
                      return (
                        <div key={cat.name}>
                          <div className="flex justify-between text-sm mb-0.5">
                            <span className="text-stone-600 truncate mr-2">
                              {cat.name} <span className="text-stone-400 text-xs">({cat.count})</span>
                            </span>
                            <span className="font-medium text-stone-800 whitespace-nowrap">
                              REF {cat.total.toFixed(2)} <span className="text-stone-400 text-xs">({pct.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-stone-400">Sin datos</p>}
              </div>
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-sm font-bold text-stone-700 mb-3 flex items-center gap-2">
                  <CreditCard size={14} className="text-stone-400" /> Por Método de Pago
                </h3>
                {byPaymentMethod.length > 0 ? (
                  <div className="space-y-2.5">
                    {byPaymentMethod.map((pm) => {
                      const pct = periodTotals.totalRef > 0 ? (pm.total / periodTotals.totalRef * 100) : 0;
                      return (
                        <div key={pm.id}>
                          <div className="flex justify-between text-sm mb-0.5">
                            <span className="text-stone-600">{pm.name} <span className="text-stone-400 text-xs">({pm.count})</span></span>
                            <span className="font-medium text-stone-800 whitespace-nowrap">
                              REF {pm.total.toFixed(2)} <span className="text-stone-400 text-xs">({pct.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-stone-400">Sin datos</p>}
              </div>
            </div>

            {/* Distribución por tipo */}
            <div className="bg-white rounded-lg border border-stone-200 p-4">
              <h3 className="text-sm font-bold text-stone-700 mb-3">Distribución por Tipo</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-brand-cream-light rounded-lg p-4 border border-brand-cream">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-brand uppercase font-medium">Gastos Fijos</p>
                      <p className="text-xl font-bold text-brand">REF {typeSplit.fijo.total.toFixed(2)}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{typeSplit.fijo.count} gastos</p>
                    </div>
                    <span className="text-lg font-bold text-brand">
                      {periodTotals.totalRef > 0 ? ((typeSplit.fijo.total / periodTotals.totalRef) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-brand-cream rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${periodTotals.totalRef > 0 ? (typeSplit.fijo.total / periodTotals.totalRef * 100) : 0}%` }} />
                  </div>
                </div>
                <div className="bg-stone-100 rounded-lg p-4 border border-stone-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-stone-600 uppercase font-medium">Gastos Variables</p>
                      <p className="text-xl font-bold text-stone-700">REF {typeSplit.variable.total.toFixed(2)}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{typeSplit.variable.count} gastos</p>
                    </div>
                    <span className="text-lg font-bold text-stone-600">
                      {periodTotals.totalRef > 0 ? ((typeSplit.variable.total / periodTotals.totalRef) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-stone-200 rounded-full overflow-hidden">
                    <div className="h-full bg-stone-500 rounded-full transition-all" style={{ width: `${periodTotals.totalRef > 0 ? (typeSplit.variable.total / periodTotals.totalRef * 100) : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Top gastos */}
            {filterCategory !== "all" && filtered.length > 0 && (
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-sm font-bold text-stone-700 mb-3 flex items-center gap-2">
                  <ArrowUpRight size={14} className="text-red-400" />
                  Todos los gastos · {filterCategory}
                  <span className="text-xs font-normal text-stone-400 ml-1">({filtered.length})</span>
                </h3>
                <div className="space-y-1 max-h-[600px] overflow-y-auto">
                  {[...filtered].sort((a, b) => Number(b.amount_ref || 0) - Number(a.amount_ref || 0)).map((e, i) => (
                    <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-stone-50 last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold text-stone-400 w-6 shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate">{e.description}</p>
                          <p className="text-[10px] text-stone-400">
                            {new Date(e.expense_date + "T12:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-red-600 shrink-0 ml-2">REF {Number(e.amount_ref).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filterCategory === "all" && expensesByCategory.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-stone-700 mb-3 flex items-center gap-2">
                  <ArrowUpRight size={14} className="text-red-400" /> Top gastos por categoría
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {expensesByCategory.map((g) => {
                    const overflow = g.items.length - 5;
                    return (
                      <div key={g.category} className="bg-white rounded-lg border border-stone-200 p-3 flex flex-col">
                        <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-stone-100">
                          <h4 className="text-sm font-bold text-stone-800 truncate">{g.category}</h4>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-sm font-bold text-red-600">REF {g.total.toFixed(2)}</p>
                            <p className="text-[10px] text-stone-400">{g.items.length} gasto{g.items.length !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <div className="space-y-1 flex-1">
                          {g.items.slice(0, 5).map((e, i) => (
                            <div key={e.id} className="flex items-center justify-between py-1 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-stone-400 w-3 shrink-0">{i + 1}</span>
                                <span className="text-stone-700 truncate">{e.description}</span>
                              </div>
                              <span className="font-semibold text-stone-700 shrink-0 ml-1">REF {Number(e.amount_ref).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        {overflow > 0 && (
                          <button onClick={() => setCategoryModal(g.category)}
                            className="mt-2 pt-2 border-t border-stone-100 text-xs text-brand hover:text-brand-dark font-medium text-center">
                            Ver {overflow} más →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tendencia mensual */}
            {period === "year" && monthlyTrend.length > 0 && (
              <div className="bg-white rounded-lg border border-stone-200 p-4">
                <h3 className="text-sm font-bold text-stone-700 mb-4 flex items-center gap-2">
                  <BarChart3 size={14} className="text-stone-400" /> Tendencia Mensual {start.getFullYear()}
                </h3>
                <div className="flex items-end gap-2 h-40">
                  {monthlyTrend.map((m) => {
                    const heightPct = maxMonthTotal > 0 ? (m.total / maxMonthTotal) * 100 : 0;
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] font-medium text-stone-500">{m.total > 0 ? Math.round(m.total) : "0"}</span>
                        <div className="w-full flex-1 flex items-end">
                          <div className="w-full bg-red-400 rounded-t transition-all hover:bg-red-500"
                            style={{ height: `${Math.max(heightPct, m.total > 0 ? 4 : 0)}%` }} />
                        </div>
                        <span className="text-[10px] text-stone-400">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═════ LIST ═════ */}
        {viewMode === "list" && !loading && (
          <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
            {filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-stone-500">Fecha</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-stone-500">Tipo</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-stone-500">Categoría</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-stone-500">Descripción</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-stone-500">REF</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-stone-500">Bs</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-stone-500">Método</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-stone-500">Origen</th>
                      {isAdmin && <th className="text-center px-4 py-3 text-xs font-medium text-stone-500 w-20"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filtered.map((e) => {
                      const isDeleting = confirmDelete === e.id;
                      return (
                        <React.Fragment key={e.id}>
                          <tr className={`hover:bg-stone-50 ${isDeleting ? "bg-red-50" : ""}`}>
                            <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                              {new Date(e.expense_date + "T12:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                e.expense_type === "fijo" ? "bg-brand-cream-light text-brand" : "bg-stone-200 text-stone-600"
                              }`}>
                                {e.expense_type === "fijo" ? "Fijo" : "Variable"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-stone-600 text-xs">{e.category}</td>
                            <td className="px-4 py-3 text-stone-800 font-medium">{e.description}</td>
                            <td className="px-4 py-3 text-right font-bold text-red-600 whitespace-nowrap">REF {Number(e.amount_ref || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-stone-600 whitespace-nowrap">
                              {e.amount_bs ? `Bs ${Number(e.amount_bs).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-stone-500 text-xs">{METHOD_LABELS[e.payment_method] || e.payment_method}</td>
                            <td className="px-4 py-3 text-xs">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                e.source === "manual" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                e.source === "legacy" ? "bg-stone-100 text-stone-600 border-stone-300" :
                                "bg-blue-50 text-blue-700 border-blue-200"
                              }`}>
                                {e.source === "manual" ? "Manual" : e.source === "legacy" ? "Histórico" : "Auto"}
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => startEdit(e)} className="p-1 text-stone-400 hover:text-brand hover:bg-brand-cream-light rounded" title="Editar">
                                    <Edit3 size={14} />
                                  </button>
                                  <button onClick={() => setConfirmDelete(e.id)} className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                          {isDeleting && (
                            <tr className="bg-red-50">
                              <td colSpan={isAdmin ? 9 : 8} className="px-4 py-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-red-700 font-medium">¿Eliminar este gasto?</span>
                                  <div className="flex gap-2">
                                    <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 bg-stone-200 hover:bg-stone-300 rounded text-xs font-medium">
                                      Cancelar
                                    </button>
                                    <button onClick={() => handleDelete(e.id)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium">
                                      Confirmar
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-stone-400">
                <TrendingDown size={32} className="mx-auto mb-2 text-stone-300" />
                <p className="text-sm">No hay gastos en este periodo</p>
              </div>
            )}
          </div>
        )}

        {/* Modal categoría detalle */}
        {categoryModal && (() => {
          const group = expensesByCategory.find((g) => g.category === categoryModal);
          if (!group) return null;
          return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCategoryModal(null)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 shrink-0">
                  <div>
                    <h3 className="text-base font-bold text-stone-800">{group.category}</h3>
                    <p className="text-xs text-stone-500">
                      {group.items.length} gasto{group.items.length !== 1 ? "s" : ""} · Total <span className="font-bold text-red-600">REF {group.total.toFixed(2)}</span>
                    </p>
                  </div>
                  <button onClick={() => setCategoryModal(null)} className="p-1 hover:bg-stone-100 rounded">
                    <X size={18} className="text-stone-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-1">
                    {group.items.map((e, i) => (
                      <div key={e.id} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-bold text-stone-400 w-6 shrink-0">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-800 truncate">{e.description}</p>
                            <p className="text-[10px] text-stone-400">
                              {new Date(e.expense_date + "T12:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" })}
                              <span className="ml-1 capitalize">· {e.expense_type}</span>
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-red-600 shrink-0 ml-2">REF {Number(e.amount_ref).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
