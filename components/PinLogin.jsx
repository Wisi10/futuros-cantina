"use client";
import { useState } from "react";
import { Delete } from "lucide-react";

export default function PinLogin({ onLogin, error, loading }) {
  const [pin, setPin] = useState("");

  const handleDigit = (d) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) onLogin(next);
  };

  const handleDelete = () => setPin((p) => p.slice(0, -1));
  const handleClear = () => setPin("");

  const dots = Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={`w-5 h-5 rounded-full border-2 transition-all ${
        i < pin.length
          ? "bg-brand border-brand scale-110"
          : "border-stone-300 bg-white"
      }`}
    />
  ));

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "clear", 0, "del"];

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-brand mb-1">Futuros</h1>
        <p className="text-brand/60 text-sm">Cantina POS</p>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-xs">
        <p className="text-center text-sm text-stone-500 mb-4">Ingresa tu PIN</p>

        <div className="flex justify-center gap-4 mb-6">{dots}</div>

        {error && (
          <p className="text-center text-xs text-red-500 mb-3 font-medium">{error}</p>
        )}

        {loading && (
          <p className="text-center text-xs text-brand mb-3 animate-pulse">
            Verificando...
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) =>
            k === "clear" ? (
              <button
                key="clear"
                onClick={handleClear}
                className="h-16 rounded-xl bg-stone-100 text-stone-400 text-xs font-medium active:bg-stone-200 transition-colors"
              >
                Borrar
              </button>
            ) : k === "del" ? (
              <button
                key="del"
                onClick={handleDelete}
                className="h-16 rounded-xl bg-stone-100 flex items-center justify-center active:bg-stone-200 transition-colors"
              >
                <Delete size={20} className="text-stone-400" />
              </button>
            ) : (
              <button
                key={k}
                onClick={() => handleDigit(String(k))}
                disabled={loading}
                className="h-16 rounded-xl bg-brand-cream-light text-brand text-2xl font-bold active:bg-brand active:text-white transition-colors disabled:opacity-50"
              >
                {k}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
