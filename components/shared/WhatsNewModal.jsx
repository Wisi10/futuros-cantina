"use client";
import React, { useState, useMemo } from 'react';
import { Sparkles, X, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';

export default function WhatsNewModal({ release, currentUser, onDismiss }) {
  // Normalizar: si el release tiene `pages`, lo usamos. Si solo tiene `items`
  // (formato viejo), construimos una sola página equivalente.
  const allPages = useMemo(() => {
    if (!release) return [];
    if (Array.isArray(release.pages) && release.pages.length > 0) return release.pages;
    if (Array.isArray(release.items) && release.items.length > 0) {
      return [{
        icon: '📌', title: release.title || 'Novedades',
        roles: ['*'], items: release.items,
      }];
    }
    return [];
  }, [release]);

  // Filtrar páginas por rol del usuario actual
  const role = currentUser?.role || 'staff';
  const pages = useMemo(() => allPages.filter(p => {
    if (!p.roles || p.roles.length === 0) return true;
    if (p.roles.includes('*')) return true;
    return p.roles.includes(role);
  }), [allPages, role]);

  const [idx, setIdx] = useState(0);

  if (!release || pages.length === 0) return null;

  const page = pages[idx];
  const isFirst = idx === 0;
  const isLast = idx === pages.length - 1;
  const total = pages.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between bg-brand-cream-light rounded-t-xl">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand" />
            <div>
              <p className="text-[10px] text-stone-500 uppercase tracking-wider">Qué hay de nuevo</p>
              <p className="font-bold text-stone-800">{release.title}</p>
            </div>
          </div>
          <button onClick={onDismiss} className="p-1 hover:bg-white/50 rounded text-stone-500" title="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Progress dots */}
        {total > 1 && (
          <div className="px-4 pt-3 flex items-center justify-center gap-1.5">
            {pages.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? 'bg-brand w-6' : 'bg-stone-300 w-1.5 hover:bg-stone-400'
                }`}
                aria-label={`Ir a página ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Page content */}
        <div className="p-5 overflow-y-auto flex-1">
          <div className="flex flex-col items-center text-center mb-4">
            {page.icon && <div className="text-5xl mb-2">{page.icon}</div>}
            <h3 className="text-lg font-bold text-stone-800">{page.title}</h3>
            <p className="text-[11px] text-stone-400 mt-1">{release.date} · {idx + 1} de {total}</p>
          </div>

          {page.body && (
            <p className="text-sm text-stone-700 leading-relaxed mb-3">{page.body}</p>
          )}

          {Array.isArray(page.items) && page.items.length > 0 && (
            <ul className="space-y-2 mt-3">
              {page.items.map((it, i) => (
                <li key={i} className="flex gap-2 text-sm text-stone-700">
                  <span className="text-brand mt-0.5">•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          )}

          {page.cta && (
            <p className="mt-4 text-xs text-stone-500 italic border-l-2 border-brand pl-3">
              💡 {page.cta}
            </p>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="px-4 py-3 border-t border-stone-200 flex items-center justify-between bg-stone-50 rounded-b-xl">
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={isFirst}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-200 rounded disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={14} /> Anterior
          </button>

          {isLast ? (
            <button onClick={onDismiss}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-brand hover:bg-brand-dark text-white rounded text-sm font-medium">
              <CheckCircle2 size={14} /> Entendido
            </button>
          ) : (
            <button onClick={() => setIdx(i => Math.min(pages.length - 1, i + 1))}
              className="flex items-center gap-1 px-4 py-1.5 bg-brand hover:bg-brand-dark text-white rounded text-sm font-medium">
              Siguiente <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
