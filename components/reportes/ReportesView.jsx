"use client";
import ReportesContentView from "./ReportesContentView";

// Wrapper simple. Antes este componente alojaba subtabs "Reportes" + "Gastos",
// pero Gastos pasó a ser tab principal del menú (migration 047 + GastosTabView).
export default function ReportesView({ user, rate, onNavigateToDeudores }) {
  return <ReportesContentView user={user} rate={rate} onNavigateToDeudores={onNavigateToDeudores} />;
}
