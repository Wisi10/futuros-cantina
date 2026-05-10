"use client";
import { ProductImage } from "@/lib/utils";

export default function RewardTimelineChart({ rewards, clientPoints = null }) {
  if (!rewards || rewards.length === 0) {
    return (
      <div className="bg-stone-50 border border-dashed border-stone-300 rounded-xl p-6 text-center">
        <p className="text-sm text-stone-500 font-medium">Sin premios configurados</p>
        <p className="text-xs text-stone-400 mt-1">Marca un producto como canjeable para verlo en la linea</p>
      </div>
    );
  }

  const sorted = [...rewards].sort(
    (a, b) => Number(a.redemption_cost_points || 0) - Number(b.redemption_cost_points || 0)
  );
  const total = sorted.length;

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 md:p-6">
      <p className="text-[10px] uppercase tracking-wider text-stone-500 font-medium mb-4">
        Linea de premios
      </p>

      <div className="relative pt-2 pb-12">
        {/* track */}
        <div className="absolute left-0 right-0 top-8 h-1.5 bg-gradient-to-r from-stone-200 via-gold/40 to-gold rounded-full" />

        {/* markers */}
        <div className="relative flex justify-between items-start">
          {/* Origin marker */}
          <div className="flex flex-col items-center" style={{ flex: "0 0 auto" }}>
            <div className="w-3 h-3 rounded-full bg-stone-300 border-2 border-white shadow ring-1 ring-stone-200 mt-[18px]" />
            <p className="text-[10px] text-stone-400 mt-2">0</p>
          </div>

          {sorted.map((r, idx) => {
            const pts = Number(r.redemption_cost_points || 0);
            const pct = ((idx + 1) / (total + 1)) * 100;
            const canRedeem = clientPoints != null && pts > 0 && clientPoints >= pts;
            const ringClass = canRedeem
              ? "ring-4 ring-green-500 shadow-lg"
              : clientPoints != null
                ? "ring-2 ring-stone-300 opacity-60"
                : "ring-2 ring-gold";
            const sizePx = canRedeem ? 44 : 36;
            const stickClass = canRedeem ? "bg-green-500" : clientPoints != null ? "bg-stone-300" : "bg-gold";
            const labelClass = canRedeem ? "text-green-700" : clientPoints != null ? "text-stone-400" : "text-gold";
            return (
              <div
                key={r.id}
                className="absolute flex flex-col items-center"
                style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
              >
                <ProductImage product={r} size={sizePx} className={`rounded-lg shadow-md bg-white ${ringClass}`} />
                <div className={`w-1 h-2 mt-1 ${stickClass}`} />
                <p className={`text-[11px] font-bold mt-0.5 whitespace-nowrap ${labelClass}`}>{pts.toLocaleString()} pts</p>
                <p className="text-[10px] text-stone-500 mt-0.5 max-w-[80px] text-center truncate">
                  {(r.name || "").trim()}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
