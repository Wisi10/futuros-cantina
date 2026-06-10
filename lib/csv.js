"use client";

// Export de gastos cantina a CSV (replica el patrón de futuros-demo).
// Diferencia clave: cantina_expenses usa `description` (no `name`),
// `amount_ref` canonical (no `amount_usd`), y `exchange_rate_bs`.
export function exportExpensesToCSV(expenses, filename) {
  const headers = [
    "Fecha", "Tipo", "Categoría", "Descripción", "Origen",
    "Monto (REF)", "Monto (Bs)", "Tasa", "Método", "Referencia", "Creado por",
  ];
  const rows = (expenses || []).map((e) => [
    e.expense_date || "",
    e.expense_type === "fijo" ? "Fijo" : "Variable",
    e.category || "",
    e.description || "",
    e.source || "manual",
    Number(e.amount_ref || 0).toFixed(2),
    Number(e.amount_bs || 0).toFixed(2),
    e.exchange_rate_bs || "",
    e.payment_method || "",
    e.reference || "",
    e.created_by || "",
  ]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
