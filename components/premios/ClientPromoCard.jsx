"use client";
import { Gift, ExternalLink, Loader2 } from "lucide-react";

export default function ClientPromoCard({ client, onRedeem, onViewProfile, redeemingPromoId }) {
  const promos = Array.isArray(client.qualifying_promos) ? client.qualifying_promos : [];

  const availableCount   = promos.filter((p) => p.status === "available").length;
  const redeemedCount    = promos.filter((p) => p.status === "redeemed").length;
  const pendingCount     = promos.filter((p) => p.status === "pending").length;

  const overall =
    availableCount > 0 ? "available"
    : pendingCount > 0 ? "pending"
    : redeemedCount > 0 ? "redeemed"
    : "none";

  const dotClass =
    overall === "available" ? "bg-green-500"
    : overall === "pending" ? "bg-amber-400"
    : overall === "redeemed" ? "bg-stone-300"
    : "bg-stone-200";

  const containerClass =
    overall === "available" ? "border-green-200 bg-green-50/30"
    : overall === "pending" ? "border-stone-200 bg-white"
    : "border-stone-200 bg-stone-50/50";

  const name = (client.client_name || "?").trim().replace(/\s+/g, " ");
  const cedula = client.client_cedula;

  const hF5    = Number(client.hours_f5    || 0);
  const hF7    = Number(client.hours_f7    || 0);
  const hTotal = Number(client.hours_total || 0);

  return (
    <div className={`rounded-xl border p-3 ${containerClass}`}>
      <div className="flex items-start gap-2 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dotClass} mt-1.5 shrink-0`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-800 truncate">{name}</p>
          <p className="text-[11px] text-stone-500">
            {cedula ? `CI: ${cedula}` : "Sin cedula"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2 text-[11px]">
        <div className="bg-white rounded-lg px-2 py-1.5 border border-stone-100">
          <p className="text-stone-400">F5</p>
          <p className="font-bold text-stone-700">{hF5.toFixed(1)} hrs</p>
        </div>
        <div className="bg-white rounded-lg px-2 py-1.5 border border-stone-100">
          <p className="text-stone-400">F7</p>
          <p className="font-bold text-stone-700">{hF7.toFixed(1)} hrs</p>
        </div>
        <div className="bg-white rounded-lg px-2 py-1.5 border border-stone-100">
          <p className="text-stone-400">Total</p>
          <p className="font-bold text-stone-700">{hTotal.toFixed(1)} hrs</p>
        </div>
      </div>

      {promos.length > 0 && (
        <div className="space-y-1 mb-2">
          {promos.map((p) => {
            const isAvailable = p.status === "available";
            const isRedeemed  = p.status === "redeemed";
            const acc = Number(p.hours_accumulated || 0);
            const thr = Number(p.hours_threshold   || 0);
            const remaining = Math.max(0, thr - acc);
            const symbol =
              isAvailable ? "✓"
              : isRedeemed ? "·"
              : "○";
            return (
              <div
                key={p.promo_id}
                className={`flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded ${
                  isAvailable ? "bg-gold/5"
                  : isRedeemed ? "bg-stone-100 text-stone-400"
                  : "bg-stone-50"
                }`}
              >
                <span className="truncate">
                  <span className={isAvailable ? "text-gold font-bold" : ""}>{symbol}</span>{" "}
                  <span className={isAvailable ? "font-medium text-stone-700" : "text-stone-500"}>
                    {(p.promo_name || "").trim() || "Promo"}
                  </span>
                </span>
                <span className="text-[10px] text-stone-500 shrink-0">
                  {isAvailable
                    ? "DISPONIBLE"
                    : isRedeemed
                    ? "Canjeado"
                    : `${acc.toFixed(1)}/${thr} hrs · faltan ${remaining.toFixed(1)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        {availableCount > 0 && onRedeem && (
          <div className="flex-1 grid gap-1">
            {promos
              .filter((p) => p.status === "available")
              .map((p) => (
                <button
                  key={p.promo_id}
                  onClick={() => onRedeem(p, client)}
                  disabled={redeemingPromoId === p.promo_id}
                  className="px-3 py-2 bg-gold text-white rounded-lg text-xs font-bold hover:bg-gold-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {redeemingPromoId === p.promo_id ? (
                    <><Loader2 size={12} className="animate-spin" /> Canjeando...</>
                  ) : (
                    <><Gift size={12} /> Canjear {(p.promo_name || "").trim().split(" ")[0] || "premio"}</>
                  )}
                </button>
              ))}
          </div>
        )}
        {onViewProfile && (
          <button
            onClick={() => onViewProfile(client)}
            className="px-3 py-2 border border-stone-300 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <ExternalLink size={12} /> Ver perfil
          </button>
        )}
      </div>
    </div>
  );
}
