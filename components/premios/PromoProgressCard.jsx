"use client";
import { Gift, Check } from "lucide-react";

export default function PromoProgressCard({ promo, onRedeem, redeeming }) {
  const accumulated = Number(promo.hours_accumulated || 0);
  const threshold = Number(promo.hours_threshold || 0);
  const pct = threshold > 0 ? Math.min(100, (accumulated / threshold) * 100) : 0;
  const status = promo.status || "pending";
  const isAvailable = status === "available";
  const isRedeemed = status === "redeemed";
  const isExpired = status === "expired";
  const remaining = Math.max(0, threshold - accumulated);

  const tierLabel =
    promo.court_tier === "any" ? "cualquier cancha"
    : promo.court_tier === "F5" ? "F5"
    : promo.court_tier === "F7" ? "F7"
    : promo.court_tier === "F11" ? "F11"
    : promo.court_tier;

  const containerClass = isAvailable
    ? "bg-gold/5 border-gold/30"
    : isRedeemed
    ? "bg-stone-100 border-stone-200 opacity-70"
    : isExpired
    ? "bg-stone-50 border-stone-200 opacity-60"
    : "bg-white border-stone-200";

  const fillClass = isAvailable ? "bg-gold" : isRedeemed ? "bg-stone-400" : "bg-stone-300";

  return (
    <div className={`rounded-xl border p-3 ${containerClass}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-800 truncate">{(promo.promo_name || "").trim() || "Promo"}</p>
          <p className="text-[11px] text-stone-500 truncate">
            {(promo.product_name || "").trim() || "?"} · {tierLabel}
          </p>
        </div>
        {isAvailable && (
          <span className="text-[9px] font-bold uppercase tracking-wider bg-gold text-white px-2 py-0.5 rounded-full shrink-0">
            Disponible
          </span>
        )}
        {isRedeemed && (
          <span className="text-[9px] font-bold uppercase tracking-wider bg-stone-300 text-stone-600 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
            <Check size={9} /> Canjeado
          </span>
        )}
        {isExpired && (
          <span className="text-[9px] font-bold uppercase tracking-wider bg-stone-200 text-stone-500 px-2 py-0.5 rounded-full shrink-0">
            Expirado
          </span>
        )}
      </div>

      <div className="h-2 bg-stone-200 rounded-full overflow-hidden mb-1.5">
        <div className={`h-full ${fillClass} transition-all`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-stone-500">
          {accumulated.toFixed(1)} / {threshold} hrs
        </span>
        {!isAvailable && !isRedeemed && !isExpired && remaining > 0 && (
          <span className="text-stone-400">Faltan {remaining.toFixed(1)} hrs</span>
        )}
      </div>

      {isAvailable && onRedeem && (
        <button
          onClick={onRedeem}
          disabled={!!redeeming}
          className="mt-2 w-full py-2 bg-gold text-white rounded-lg text-xs font-bold hover:bg-gold-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <Gift size={12} /> {redeeming ? "Canjeando..." : "Canjear ahora"}
        </button>
      )}
    </div>
  );
}
