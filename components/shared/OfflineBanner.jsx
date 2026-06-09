"use client";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

// Banner naranja arriba del POS cuando offline o hay cola pendiente.
// Estados:
//   - online + 0 pending → no muestra nada
//   - offline + N pending → banner naranja "Sin conexión · N en cola"
//   - online + N pending → banner azul "Sincronizando N venta(s)..."
//   - online + 0 failed → no muestra nada (todo OK silencio)
//   - failed > 0 → banner rojo "N ventas no sincronizaron"
export default function OfflineBanner({ isOnline, pendingCount, syncingCount = 0, failedCount = 0, onRetry }) {
  if (isOnline && pendingCount === 0 && failedCount === 0) return null;

  if (failedCount > 0) {
    return (
      <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between gap-2 text-xs font-medium shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} />
          <span>{failedCount} venta{failedCount === 1 ? "" : "s"} con error de sync — revisar con admin</span>
        </div>
        {onRetry && (
          <button onClick={onRetry} className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-[11px] font-bold">
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center gap-2 text-xs font-medium shrink-0">
        <WifiOff size={14} />
        <span>
          Sin conexión a internet
          {pendingCount > 0 && <> · <b>{pendingCount}</b> venta{pendingCount === 1 ? "" : "s"} en cola</>}
          {" "}— las ventas se cobran y suben cuando vuelva
        </span>
      </div>
    );
  }

  // Online con pendientes → sincronizando
  return (
    <div className="bg-blue-600 text-white px-4 py-2 flex items-center gap-2 text-xs font-medium shrink-0">
      <Loader2 size={14} className="animate-spin" />
      <span>
        Sincronizando <b>{pendingCount}</b> venta{pendingCount === 1 ? "" : "s"}...
      </span>
    </div>
  );
}

// Badge compacto para el header
export function ConnectionBadge({ isOnline, pendingCount, failedCount = 0 }) {
  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return (
      <span title="Todo sincronizado" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
        <CheckCircle2 size={9} /> OK
      </span>
    );
  }
  if (failedCount > 0) {
    return (
      <span title={failedCount + " ventas con error"} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
        <AlertTriangle size={9} /> {failedCount}
      </span>
    );
  }
  if (!isOnline) {
    return (
      <span title="Sin conexión" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
        <WifiOff size={9} /> {pendingCount}
      </span>
    );
  }
  return (
    <span title={pendingCount + " sincronizando"} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
      <Loader2 size={9} className="animate-spin" /> {pendingCount}
    </span>
  );
}
