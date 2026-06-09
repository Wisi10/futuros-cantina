"use client";
import { Sun, Moon, ShoppingCart, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function TurnosGuide() {
  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-6">
      {/* Regla de oro */}
      <div className="bg-brand-cream-light border border-gold/40 rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-[1.5px] text-gold font-bold mb-1">Regla de oro</p>
        <p className="text-sm text-stone-700 font-medium leading-relaxed">
          Un turno = un día de trabajo. <b>Abrí el turno al empezar el día</b> y <b>cerralo al terminar la noche</b>.
          Nunca dejes un turno abierto de un día para otro.
        </p>
      </div>

      {/* Abrir turno */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-full bg-ok/15 flex items-center justify-center shrink-0">
            <Sun size={18} className="text-ok" />
          </span>
          <h3 className="text-base font-bold text-stone-800">Abrir turno</h3>
          <span className="text-[10px] text-stone-400">· al empezar el día</span>
        </div>
        <ol className="space-y-2 text-sm text-stone-600">
          <li className="flex gap-2"><b className="text-brand">1.</b> Entrá a la pantalla <b>Vender</b>.</li>
          <li className="flex gap-2"><b className="text-brand">2.</b> Si no hay turno abierto, tocá la barra de arriba (<b>abrir turno</b>).</li>
          <li className="flex gap-2"><b className="text-brand">3.</b> Escribí el <b>efectivo inicial</b> de la gaveta (Bs y USD). Si no hay base, dejá 0.</li>
          <li className="flex gap-2"><b className="text-brand">4.</b> Tocá <b>Abrir turno</b>. Ya podés vender. ✅</li>
        </ol>
      </div>

      {/* Cerrar turno */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
            <Moon size={18} className="text-brand" />
          </span>
          <h3 className="text-base font-bold text-stone-800">Cerrar turno</h3>
          <span className="text-[10px] text-stone-400">· al terminar la noche</span>
        </div>
        <ol className="space-y-2 text-sm text-stone-600">
          <li className="flex gap-2"><b className="text-brand">1.</b> En <b>Vender</b>, tocá la <b>barra del turno</b> de arriba (la que dice <span className="font-mono text-xs">REF ... · ... ventas</span>).</li>
          <li className="flex gap-2"><b className="text-brand">2.</b> La app te muestra el <b>efectivo esperado</b> (Bs y USD).</li>
          <li className="flex gap-2"><b className="text-brand">3.</b> <b>Contá la plata real</b> de la gaveta y escribila en <b>contado Bs</b> y <b>contado USD</b>.</li>
          <li className="flex gap-2"><b className="text-brand">4.</b> Mirá la <b>diferencia</b>: 🟢 cuadra · 🟡 sobra · 🔴 falta.</li>
          <li className="flex gap-2"><b className="text-brand">5.</b> Tocá <b>Cerrar turno</b>. Día cerrado. ✅</li>
        </ol>
        <p className="mt-3 text-xs text-stone-500 bg-stone-50 rounded-lg p-2 flex gap-2">
          <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
          Si la diferencia es muy grande (rojo fuerte), avisá al encargado antes de cerrar.
        </p>
      </div>

      {/* Cuándo */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="text-base font-bold text-stone-800 mb-3">¿Cuándo hacer cada cosa?</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <Sun size={16} className="text-ok shrink-0" />
            <span className="text-stone-500 w-40 shrink-0">Al llegar / empezar</span>
            <b className="text-stone-700">Abrir turno</b>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <ShoppingCart size={16} className="text-stone-400 shrink-0" />
            <span className="text-stone-500 w-40 shrink-0">Durante el día</span>
            <b className="text-stone-700">Solo vender</b>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Moon size={16} className="text-brand shrink-0" />
            <span className="text-stone-500 w-40 shrink-0">Al terminar la noche</span>
            <b className="text-stone-700">Cerrar turno (con conteo)</b>
          </div>
        </div>
      </div>

      {/* Problemas */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="text-base font-bold text-stone-800 mb-3">Problemas comunes</h3>
        <div className="space-y-3 text-sm text-stone-600">
          <div className="flex gap-2">
            <CheckCircle2 size={16} className="text-gold shrink-0 mt-0.5" />
            <p><b>"Ya hay un turno abierto"</b> → el turno del día anterior quedó sin cerrar. Cerralo primero (tocá la barra del turno) y después abrí el nuevo.</p>
          </div>
          <div className="flex gap-2">
            <CheckCircle2 size={16} className="text-gold shrink-0 mt-0.5" />
            <p><b>La app dice que no hay turno pero sí hay</b> → cerrá la app por completo y volvé a entrar.</p>
          </div>
          <div className="flex gap-2">
            <CheckCircle2 size={16} className="text-gold shrink-0 mt-0.5" />
            <p>Cualquier duda con el cuadre o la caja → avisá al encargado <b>antes</b> de cerrar.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
