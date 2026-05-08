"use client";
import { useState } from "react";
import { BarChart3, Receipt } from "lucide-react";
import ReportesContentView from "./ReportesContentView";
import GastosView from "@/components/gastos/GastosView";

const SUBTABS = [
  { id: "reportes", label: "Reportes", icon: BarChart3 },
  { id: "gastos",   label: "Gastos",   icon: Receipt   },
];

export default function ReportesView({ user, rate }) {
  const [active, setActive] = useState("reportes");

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 pt-4 pb-3 shrink-0 flex gap-2">
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

      <div className="flex-1 min-h-0 border-t border-stone-200">
        {active === "reportes" && <ReportesContentView user={user} rate={rate} />}
        {active === "gastos" && <GastosView user={user} rate={rate} />}
      </div>
    </div>
  );
}
