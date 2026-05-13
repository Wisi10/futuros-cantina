"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, X, ArrowRight } from "lucide-react";

export default function StockAlertToast({ items, onDismiss, onNavigate }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    }, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!visible || items.length === 0) return null;

  const summary = items
    .slice(0, 3)
    .map((p) => `${p.name} (${Number(p.stock_quantity || 0)})`)
    .join(", ");
  const more = items.length > 3 ? ` y ${items.length - 3} más` : "";

  return (
    <div className="fixed top-4 right-4 left-4 md:left-auto md:max-w-md z-50 bg-amber-50 border border-amber-300 rounded-xl shadow-lg p-3 flex items-start gap-2">
      <AlertTriangle size={18} className="text-amber-700 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 text-xs text-amber-900">
        <p className="font-semibold">{items.length} producto{items.length !== 1 ? "s" : ""} con stock bajo</p>
        <p className="text-amber-800">{summary}{more}</p>
        {onNavigate && (
          <button
            onClick={() => { onNavigate(); setVisible(false); if (onDismiss) onDismiss(); }}
            className="inline-flex items-center gap-1 mt-1 text-amber-900 hover:text-amber-950 font-semibold"
          >
            Ir a Inventario <ArrowRight size={11} />
          </button>
        )}
      </div>
      <button
        onClick={() => { setVisible(false); if (onDismiss) onDismiss(); }}
        className="text-amber-700 hover:text-amber-900 p-0.5 shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
