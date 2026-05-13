"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { generateId } from "@/lib/utils";

export default function OpenShiftModal({ user, onOpen, onClose }) {
  const [cashBs, setCashBs] = useState("");
  const [cashUsd, setCashUsd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    // Validar montos no negativos. Vacio = 0 implicito (acepta).
    const bs = cashBs === "" ? 0 : parseFloat(cashBs);
    const usd = cashUsd === "" ? 0 : parseFloat(cashUsd);
    if (!Number.isFinite(bs) || bs < 0 || !Number.isFinite(usd) || usd < 0) {
      setError("Los montos no pueden ser negativos.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = generateId();
      const { data, error: insertErr } = await supabase
        .from("shifts")
        .insert({
          id,
          opened_by: user?.name || "Staff",
          opening_cash_bs: bs,
          opening_cash_usd: usd,
          status: "open",
        })
        .select()
        .single();

      if (insertErr) {
        if (insertErr.message?.includes("unique") || insertErr.message?.includes("duplicate") || insertErr.code === "23505") {
          setError("Ya hay un turno abierto. Cierra el turno actual primero.");
        } else {
          setError("Error abriendo turno: " + insertErr.message);
        }
        setSaving(false);
        return;
      }

      onOpen(data);
    } catch (err) {
      setError("Error: " + err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-stone-800">Abrir Turno</h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center"><X size={18} className="text-stone-400" /></button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium block mb-1">Efectivo inicial Bs</label>
            <input
              type="number" step="0.01" value={cashBs} onChange={e => setCashBs(e.target.value)}
              placeholder="0.00"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold"
              style={{ fontFamily: "'Courier New', monospace" }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium block mb-1">Efectivo inicial USD</label>
            <input
              type="number" step="0.01" value={cashUsd} onChange={e => setCashUsd(e.target.value)}
              placeholder="0.00"
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold"
              style={{ fontFamily: "'Courier New', monospace" }}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium block mb-1">Quien abre</label>
            <input
              type="text" value={user?.name || ""} readOnly
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50 text-stone-500"
            />
          </div>

          {error && <p className="text-xs text-danger font-medium">{error}</p>}

          <button
            onClick={handleSubmit} disabled={saving}
            className="w-full py-3 rounded-xl bg-gold text-white font-bold text-sm hover:bg-gold-hover disabled:opacity-50 transition-colors"
          >
            {saving ? "Abriendo..." : "Abrir turno"}
          </button>
        </div>
      </div>
    </div>
  );
}
