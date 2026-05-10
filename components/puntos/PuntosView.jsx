"use client";
import { useState } from "react";
import { Star, User } from "lucide-react";
import RankingView from "./RankingView";
import RewardsConfigView from "./RewardsConfigView";
import ClientModal from "@/components/client/ClientModal";
import ClientLink from "@/components/shared/ClientLink";

export default function PuntosView({ user, rate, saleClient }) {
  const [profileClientId, setProfileClientId] = useState(null);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 md:px-6 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Star size={20} className="text-brand" />
          <h1 className="text-lg font-bold text-brand">Puntos</h1>
        </div>
        <p className="text-xs text-stone-400">Loyalty cantina · 1 REF gastado = 10 pts · caducidad 6 meses</p>
      </div>

      {saleClient && (
        <div className="px-4 md:px-6 pb-3">
          <div className="bg-green-50 border border-green-300 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <User size={18} className="text-green-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wider">Cliente activo</p>
              <p className="text-sm font-bold text-green-900 truncate">
                {saleClient.id ? <ClientLink clientId={saleClient.id} name={saleClient.name} className="text-green-900 hover:text-green-950" /> : saleClient.name}
              </p>
              <p className="text-xs text-green-700">{Number(saleClient.points || 0).toLocaleString()} pts disponibles</p>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-stone-200">
        <RewardsConfigView user={user} saleClient={saleClient} />
      </div>

      <div className="border-t border-stone-200">
        <RankingView
          user={user}
          onClientClick={(clientId) => setProfileClientId(clientId)}
        />
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
