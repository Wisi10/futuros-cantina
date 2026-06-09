"use client";
import { useState } from "react";
import { Receipt, TrendingUp } from "lucide-react";
import GastosView from "./GastosView";
import CostosView from "@/components/costos/CostosView";

const SUBTABS = [
  { id: "lista",  label: "Resumen", icon: Receipt },
  { id: "costos", label: "Costos",  icon: TrendingUp },
];

// Wrapper del tab Gastos. Sam pidió unificar bajo un solo tab principal:
//   Resumen (lista de gastos auto + manual, form para agregar)
//   Costos (margenes/profitability — antes era tab top-level "Costos")
export default function GastosTabView({ user, rate }) {
  const [active, setActive] = useState("lista");

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 pt-4 pb-3 shrink-0 flex gap-2 border-b border-stone-200">
        {SUBTABS.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                isActive
                  ? "bg-brand text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {active === "lista"  && <GastosView user={user} rate={rate} />}
        {active === "costos" && <CostosView user={user} />}
      </div>
    </div>
  );
}
