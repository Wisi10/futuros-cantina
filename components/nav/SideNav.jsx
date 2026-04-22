"use client";
import { ShoppingCart, Package, Wallet, Receipt, BarChart3, Settings, Clock } from "lucide-react";

const TABS = [
  { id: "vender", label: "Vender", icon: ShoppingCart },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "caja", label: "Caja", icon: Wallet },
  { id: "gastos", label: "Gastos", icon: Receipt },
  { id: "turnos", label: "Turnos", icon: Clock },
  { id: "reportes", label: "Reportes", icon: BarChart3 },
  { id: "config", label: "Config", icon: Settings, adminOnly: true },
];

export default function SideNav({ activeTab, onTabChange, userRole }) {
  const visibleTabs = TABS.filter((t) => !t.adminOnly || userRole === "admin");

  return (
    <nav className="w-16 bg-brand flex flex-col items-center py-4 gap-1 shrink-0">
      <div className="text-white/80 font-bold text-xs mb-4 tracking-wider">FS</div>
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active
                ? "bg-white/20 text-white"
                : "text-white/50 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            <Icon size={20} />
            <span className="text-[9px] font-medium leading-none">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
