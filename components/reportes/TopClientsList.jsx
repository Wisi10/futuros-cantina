"use client";
import { formatREF } from "@/lib/utils";
import { avatarColor, avatarInitials } from "@/lib/clientHelpers";

export default function TopClientsList({ data, onClientClick }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider mb-3">Top 5 clientes</p>
      {!data || data.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-6">Sin clientes en el periodo</p>
      ) : (
        <div className="space-y-2">
          {data.map((c, i) => {
            const color = avatarColor(c.client_name || "");
            return (
              <button
                key={c.client_id}
                onClick={() => onClientClick && onClientClick(c.client_id)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 text-left"
              >
                <span className="text-stone-400 font-bold text-xs w-4 shrink-0">{i + 1}</span>
                <div className={`w-8 h-8 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-xs font-bold shrink-0`}>
                  {avatarInitials(c.client_name || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-stone-800 truncate">{c.client_name || "(sin nombre)"}</p>
                  <p className="text-xs text-stone-400">{c.visit_count} visita{c.visit_count === 1 ? "" : "s"}</p>
                </div>
                <span className="text-sm font-bold text-brand shrink-0">{formatREF(c.total_ref)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
