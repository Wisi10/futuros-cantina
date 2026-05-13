"use client";
import { useState, useEffect, useRef } from "react";
import { X, RefreshCw, Loader2, History } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function QuickRateModal({ currentRate, user, onClose, onSaved }) {
  const [eurInput, setEurInput] = useState(currentRate?.eur ? currentRate.eur.toFixed(2) : "");
  const [usdInput, setUsdInput] = useState(currentRate?.usd ? currentRate.usd.toFixed(2) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("exchange_rates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setHistory(data || []));
  }, []);

  const handleSave = async () => {
    if (savingRef.current || !supabase) return;
    setError("");
    const eur = parseFloat(eurInput);
    const usd = parseFloat(usdInput);
    if (!Number.isFinite(eur) || eur <= 0 || !Number.isFinite(usd) || usd <= 0) {
      setError("Ambos valores deben ser números positivos");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const { error: err } = await supabase.from("exchange_rates").insert({
      eur_rate: eur,
      usd_rate: usd,
      updated_by_name: user?.name || "Cantina",
    });
    savingRef.current = false;
    setSaving(false);
    if (err) {
      setError(err.message || "Error guardando la tasa");
      return;
    }
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-bold text-stone-800 flex items-center gap-2">
            <RefreshCw size={18} /> Actualizar tasa
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center">
            <X size={18} className="text-stone-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          <p className="text-xs text-stone-500">
            Cantina cobra en USD BCV. La tasa USD/Bs es la del Banco Central (BCV).
            REF/Bs es la tasa interna de referencia (≈ EUR).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-600 block mb-1.5">USD/Bs (BCV)</label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
                placeholder="Ej: 425.67"
                autoFocus
                className="w-full border border-stone-300 rounded-xl px-3 py-3 text-base focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-stone-600 block mb-1.5">REF/Bs</label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={eurInput}
                onChange={(e) => setEurInput(e.target.value)}
                placeholder="Ej: 491.49"
                className="w-full border border-stone-300 rounded-xl px-3 py-3 text-base focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {history.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-stone-400 font-medium mb-2 flex items-center gap-1">
                <History size={12} /> Historial reciente
              </p>
              <div className="space-y-1.5">
                {history.map((r) => (
                  <div key={r.id} className="flex justify-between items-center text-xs bg-stone-50 rounded-lg px-3 py-2">
                    <span className="text-stone-700">
                      USD <span className="font-semibold">{Number(r.usd_rate).toFixed(2)}</span>
                      <span className="text-stone-300 mx-1.5">·</span>
                      REF <span className="font-semibold">{Number(r.eur_rate).toFixed(2)}</span>
                    </span>
                    <span className="text-stone-400 text-[10px]">
                      {r.updated_by_name ? `${r.updated_by_name} · ` : ""}
                      {new Date(r.created_at).toLocaleDateString("es-VE")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-stone-200 p-4 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !eurInput || !usdInput}
            className="flex-1 py-3 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : "Guardar tasa"}
          </button>
        </div>
      </div>
    </div>
  );
}
