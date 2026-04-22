"use client";

export const formatREF = (n) => `REF ${Number(n || 0).toFixed(2)}`;

export const formatBs = (ref, rate) => {
  if (!rate) return "—";
  const bs = Number(ref || 0) * rate;
  return `Bs ${bs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const calcBs = (ref, rate) => (rate ? Number(ref || 0) * rate : null);

export const generateId = () => Math.random().toString(36).substring(2, 11);

export const EXPENSE_CATEGORIES = [
  "Insumos de cocina",
  "Limpieza y sanidad",
  "Equipos y mantenimiento",
  "Gas y electricidad",
  "Personal temporal",
  "Transporte y fletes",
  "Comisiones y servicios",
  "Otros",
];

export const PAYMENT_METHODS = [
  { id: "pago_movil", label: "Pago Móvil", icon: "📱", needsRef: true },
  { id: "cash_bs", label: "Efectivo Bs", icon: "💵", needsRef: false },
  { id: "cash_usd", label: "Cash USD", icon: "💲", needsRef: false },
  { id: "zelle", label: "Zelle", icon: "🏦", needsRef: true },
];

export const METHOD_LABELS = {
  pago_movil: "Pago Móvil",
  cash_bs: "Efectivo Bs",
  cash_usd: "Cash USD",
  zelle: "Zelle",
  credit: "Crédito",
};
