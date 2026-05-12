"use client";
import { ShoppingCart, Package, Wallet, BarChart3, Settings, Clock, Star, Calendar, CalendarRange, Users, TrendingUp, Shield } from "lucide-react";

// Staff ve: vender, turnos, inventario, calendario, eventos.
// Admin (Jose Gregorio, Yusmelly) ve los tabs admin tambien.
// Owner (Sam) ve ademas el tab Admin (gestion de permisos).
const TABS = [
  { id: "vender", label: "Vender", icon: ShoppingCart },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "calendario", label: "Calendario", icon: CalendarRange },
  { id: "eventos", label: "Eventos", icon: Calendar },
  { id: "turnos", label: "Turnos", icon: Clock },
  { id: "puntos", label: "Puntos", icon: Star, adminOnly: true },
  { id: "clientes", label: "Clientes", icon: Users, adminOnly: true },
  { id: "caja", label: "Caja", icon: Wallet, adminOnly: true },
  { id: "costos", label: "Costos", icon: TrendingUp, adminOnly: true },
  { id: "reportes", label: "Reportes", icon: BarChart3, adminOnly: true },
  { id: "config", label: "Config", icon: Settings, adminOnly: true },
  { id: "admin", label: "Admin", icon: Shield, ownerOnly: true },
];

// Helper: jerarquia staff < gerente < owner
const roleLevel = (r) => r === "owner" ? 2 : (r === "gerente" || r === "admin") ? 1 : 0;

export default function SideNav({ activeTab, onTabChange, userRole }) {
  const lvl = roleLevel(userRole);
  const visibleTabs = TABS.filter((t) => {
    if (t.ownerOnly) return lvl >= 2;
    if (t.adminOnly) return lvl >= 1;
    return true;
  });

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <nav className="hidden md:flex w-16 bg-brand flex-col items-center py-4 gap-1 shrink-0">
        <div className="text-white/80 font-bold text-xs tracking-wider">FS</div>
        <div className={`text-[8px] font-medium tracking-wider uppercase mb-3 ${lvl >= 1 ? "text-gold" : "text-white/40"}`}>
          {userRole === "owner" ? "Owner" : lvl >= 1 ? "Gerente" : "Staff"}
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
        {visibleTabs.slice(0, 6).map((tab) => {
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
