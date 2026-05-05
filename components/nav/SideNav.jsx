"use client";
import { ShoppingCart, Package, Wallet, Receipt, BarChart3, Settings, Clock, Monitor, Gift } from "lucide-react";

const TABS = [
  { id: "vender", label: "Vender", icon: ShoppingCart },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "dashboard", label: "En Vivo", icon: Monitor },
  { id: "premios", label: "Premios", icon: Gift },
  { id: "caja", label: "Caja", icon: Wallet, adminOnly: true },
  { id: "gastos", label: "Gastos", icon: Receipt, adminOnly: true },
  { id: "turnos", label: "Turnos", icon: Clock, adminOnly: true },
  { id: "reportes", label: "Reportes", icon: BarChart3, adminOnly: true },
  { id: "config", label: "Config", icon: Settings, adminOnly: true },
];

export default function SideNav({ activeTab, onTabChange, userRole }) {
  const visibleTabs = TABS.filter((t) => !t.adminOnly || userRole === "admin");

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <nav className="hidden md:flex w-16 bg-brand flex-col items-center py-4 gap-1 shrink-0">
        <div className="text-white/80 font-bold text-xs tracking-wider">FS</div>
        <div className={`text-[8px] font-medium tracking-wider uppercase mb-3 ${userRole === "admin" ? "text-gold" : "text-white/40"}`}>
          {userRole === "admin" ? "Admin" : "Staff"}
        </div>
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "bg-white/20 text-white" : "text-white/50 hover:bg-white/10 hover:text-white/80"
              }`}
            >
              <Icon size={20} />
              <span className="text-[9px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile: bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-brand z-30 flex items-center justify-around px-1 py-1 safe-bottom">
        {visibleTabs.slice(0, 5).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 rounded-lg transition-colors ${
                active ? "text-white" : "text-white/40"
              }`}
            >
              <Icon size={20} />
              <span className="text-[8px] font-medium leading-none mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
