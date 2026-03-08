"use client";
import { AlertTriangle } from "lucide-react";

export default function RateChip({ rate }) {
  if (!rate) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 px-3 py-1 rounded-lg text-xs text-yellow-700 flex items-center gap-1">
        <AlertTriangle size={12} />
        Sin tasa configurada
      </div>
    );
  }

  if (rate.isOld) {
    return (
      <div className="bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg text-xs text-amber-700 flex items-center gap-1">
        <AlertTriangle size={12} />
        <span><span className="font-bold">1 REF = {rate.eur.toFixed(2)} Bs</span> (anterior)</span>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 px-3 py-1 rounded-lg text-xs text-green-700">
      <span className="font-bold">1 REF = {rate.eur.toFixed(2)} Bs</span>
    </div>
  );
}
