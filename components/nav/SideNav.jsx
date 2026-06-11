"use client";
import { useState } from "react";
import { ShoppingCart, Package, Wallet, BarChart3, Settings, Clock, Star, Calendar, CalendarRange, Users, Receipt, Shield, Menu, X } from "lucide-react";

// Staff ve: vender, turnos, inventario, calendario, eventos.
// Admin (Jose Gregorio, Yusmelly) ve los tabs admin tambien.
// Owner (Sam) ve ademas el tab Admin (gestion de permisos).
const TABS = [
  { id: "vender", label: "Vender", icon: ShoppingCart },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "calendario", label: "Calendario", icon: CalendarRange },
  { id: "turnos", label: "Turnos", icon: Clock },
  { id: "clientes", label: "Clientes", icon: Users, adminOnly: true },
  { id: "caja", label: "Caja", icon: Wallet },
  { id: "gastos", label: "Gastos", icon: Receipt },
  { id: "reportes", label: "Reportes", icon: BarChart3, adminOnly: true },
  { id: "config", label: "Config", icon: Settings, adminOnly: true },
  { id: "admin", label: "Admin", icon: Shield, ownerOnly: true },
];

// Tabs prioritarios para bottom nav mobile/tablet portrait (los 4 mas usados a diario).
// El resto va al drawer del boton "Mas".
const PRIORITY_IDS = ["vender", "inventario", "turnos", "caja"];

// Helper: jerarquia staff < gerente < owner
const roleLevel = (r) => r === "owner" ? 2 : (r === "gerente" || r === "admin") ? 1 : 0;

export default function SideNav({ activeTab, onTabChange, userRole }) {
  const lvl = roleLevel(userRole);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleTabs = TABS.filter((t) => {
    if (t.ownerOnly) return lvl >= 2;
    if (t.adminOnly) return lvl >= 1;
    return true;
  });

  // Si caben todos en bottom nav (staff con <=5), no necesitamos Mas.
  const needsOverflow = visibleTabs.length > 5;
  const priorityTabs = needsOverflow
    ? PRIORITY_IDS.map((id) => visibleTabs.find((t) => t.id === id)).filter(Boolean)
    : visibleTabs;
  const activeInBottom = priorityTabs.some((t) => t.id === activeTab);
  const masIsActive = needsOverflow && !activeInBottom;

  const pickTab = (id) => {
    onTabChange(id);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Desktop/laptop: vertical sidebar a lg+ (1024px+). Tablet portrait ya no
          entra acá — usa hamburger pattern abajo. */}
      <nav className="hidden lg:flex w-16 bg-brand flex-col items-center py-4 gap-1 shrink-0 overflow-y-auto scrollbar-hide">
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

      {/* Mobile + tablet portrait (<lg): bottom nav con 4 tabs prioritarios + boton Mas.
          Si el staff ve <=5 tabs, mostramos todos sin boton Mas. */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-brand z-30 safe-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {priorityTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-colors min-w-0 ${
                  active ? "text-white bg-white/10" : "text-white/40"
                }`}
              >
                <Icon size={22} />
                <span className="text-[9px] font-medium leading-none mt-1 truncate w-full text-center">{tab.label}</span>
              </button>
            );
          })}
          {needsOverflow && (
            <button
              onClick={() => setDrawerOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-colors min-w-0 ${
                masIsActive ? "text-white bg-white/10" : "text-white/40"
              }`}
            >
              <Menu size={22} />
              <span className="text-[9px] font-medium leading-none mt-1">Más</span>
            </button>
          )}
        </div>
      </nav>

      {/* Drawer "Más": bottom sheet con todos los tabs en grilla. */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative bg-brand rounded-t-2xl safe-bottom">
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">Menú</span>
                <span className={`text-[9px] font-medium tracking-wider uppercase ${lvl >= 1 ? "text-gold" : "text-white/40"}`}>
                  {userRole === "owner" ? "Owner" : lvl >= 1 ? "Gerente" : "Staff"}
                </span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-white/70 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 p-4">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => pickTab(tab.id)}
                    className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-colors ${
                      active ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon size={22} />
                    <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
