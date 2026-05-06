"use client";
import { useState } from "react";
import { Trophy, Gift, Star } from "lucide-react";
import RankingView from "./RankingView";
import RewardsConfigView from "./RewardsConfigView";
import ClientModal from "@/components/client/ClientModal";

const SUBTABS = [
  { id: "ranking", label: "Ranking",  icon: Trophy },
  { id: "premios", label: "Premios",  icon: Gift   },
];

export default function PuntosView({ user, rate }) {
  const [active, setActive] = useState("ranking");
  const [profileClientId, setProfileClientId] = useState(null);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Star size={20} className="text-brand" />
          <h1 className="text-lg font-bold text-brand">Puntos</h1>
        </div>
        <p className="text-xs text-stone-400">Loyalty cantina · 1 REF gastado = 10 pts · caducidad 6 meses</p>
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
        {active === "ranking" && (
          <RankingView
            user={user}
            onClientClick={(clientId) => setProfileClientId(clientId)}
          />
        )}
        {active === "premios" && <RewardsConfigView user={user} />}
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
