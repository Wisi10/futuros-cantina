"use client";
import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import QuickRateModal from "./QuickRateModal";

export default function RateChip({ rate, user, onRateUpdated }) {
  const [modalOpen, setModalOpen] = useState(false);
  const isAdmin = user?.cantinaRole === "gerente" || user?.cantinaRole === "owner" || user?.cantinaRole === "admin";

  let chipContent;
  if (!rate) {
    chipContent = (
      <span className="flex items-center gap-1.5">
        <AlertTriangle size={14} />
        <span>Sin tasa</span>
      </span>
    );
  } else if (rate.isOld) {
    chipContent = (
      <span className="flex items-center gap-1.5">
        <AlertTriangle size={14} />
        <span><span className="font-bold">REF {rate.eur.toFixed(2)}</span> · <span className="font-bold">USD {rate.usd.toFixed(2)}</span> <span className="opacity-70">(anterior)</span></span>
      </span>
    );
  } else {
    chipContent = (
      <span className="flex items-center gap-1.5">
        <span className="font-bold">REF {rate.eur.toFixed(2)}</span>
        <span className="text-stone-400">·</span>
        <span className="font-bold">USD {rate.usd.toFixed(2)}</span>
        {isAdmin && <RefreshCw size={12} className="opacity-60" />}
      </span>
    );
  }

  const colorClass = !rate
    ? "bg-yellow-50 border-yellow-200 text-yellow-700"
    : rate.isOld
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-green-50 border-green-200 text-green-700";

  const baseClass = `${colorClass} border px-3 py-2 rounded-lg text-xs min-h-[40px] inline-flex items-center`;

  if (isAdmin) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className={`${baseClass} hover:opacity-90 active:scale-95 transition-all cursor-pointer`}
          title="Tocar para actualizar tasa"
        >
          {chipContent}
        </button>
        {modalOpen && (
          <QuickRateModal
            currentRate={rate}
            user={user}
            onClose={() => setModalOpen(false)}
            onSaved={() => {
              setModalOpen(false);
              if (onRateUpdated) onRateUpdated();
            }}
          />
        )}
      </>
    );
  }

  return <div className={baseClass}>{chipContent}</div>;
}
