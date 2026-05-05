"use client";
import { useState, useMemo } from "react";
import { Settings, Trophy, Gift } from "lucide-react";
import PromosConfigView from "./PromosConfigView";
import QualifyingClientsView from "./QualifyingClientsView";
import ClientModal from "@/components/client/ClientModal";

const SUBTABS = [
  { id: "calificando", label: "Calificando", icon: Trophy },
  { id: "config",      label: "Configuracion", icon: Settings },
];

function getCurrentWeekRange() {
  // Caracas TZ Mon-Sun (lazy: compute in browser local then approximate)
  // Server-side ISO weeks via DATE_TRUNC use Mon. Mirror that here.
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const monthsAbbr = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const fmt = (d) => `${d.getDate()} ${monthsAbbr[d.getMonth()]}`;
  return `Lun ${fmt(mon)} al Dom ${fmt(sun)}`;
}

export default function PremiosView({ user, rate }) {
  const [active, setActive] = useState("calificando");
  const [profileClientId, setProfileClientId] = useState(null);
  const weekRange = useMemo(() => getCurrentWeekRange(), []);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Gift size={20} className="text-brand" />
          <h1 className="text-lg font-bold text-brand">Premios</h1>
        </div>
        <p className="text-xs text-stone-400">{weekRange}</p>
      </div>

      <div className="px-4 md:px-6 pb-3 flex gap-2 shrink-0">
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
        {active === "calificando" && (
          <QualifyingClientsView
            user={user}
            onClientClick={(c) => setProfileClientId(c.client_id)}
          />
        )}
        {active === "config" && <PromosConfigView user={user} />}
      </div>

      {profileClientId && (
        <ClientModal
          rate={rate}
          user={user}
          initialClientId={profileClientId}
          onClose={() => setProfileClientId(null)}
        />
      )}
    </div>
  );
}
