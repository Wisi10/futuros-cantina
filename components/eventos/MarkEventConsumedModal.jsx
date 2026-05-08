"use client";
import { useEffect, useState, useMemo } from "react";
import { X, Plus, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

function stockChip(stockQty, requiredQty) {
  if (stockQty == null) return { chip: "bg-stone-100 text-stone-500", label: "no en catalogo" };
  if (stockQty < requiredQty) return { chip: "bg-red-100 text-red-700", label: `${stockQty} disp.` };
  if (stockQty < requiredQty * 2) return { chip: "bg-amber-100 text-amber-700", label: `${stockQty} disp.` };
  return { chip: "bg-green-100 text-green-700", label: `${stockQty} disp.` };
}

export default function MarkEventConsumedModal({
  event,
  items,
  productsById,
  user,
  onClose,
  onConfirmed,
}) {
  // Pre-fill from cantina items only
  const initialRows = useMemo(() => (
    items
      .filter((it) => productsById[it.product_id]?.is_cantina === true)
      .map((it) => {
        const p = productsById[it.product_id] || {};
        const planned = Number(it.quantity || 0);
        return {
          key: `plan_${it.id}`,
          product_id: it.product_id,
          product_name: it.product_name || p.name || "(sin nombre)",
          planned_qty: planned,
          actual_qty: planned,
          is_extra: false,
          stock_quantity: p.stock_quantity ?? null,
        };
      })
  ), [items, productsById]);

  const [rows, setRows] = useState(initialRows);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Cantina products catalog for "+ Agregar item extra"
  const [allCantina, setAllCantina] = useState([]);
  const [showExtraPicker, setShowExtraPicker] = useState(false);
  const [extraSearch, setExtraSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, cost_ref, stock_quantity, is_cantina, active")
        .eq("is_cantina", true)
        .eq("active", true)
        .order("name");
      if (mounted) setAllCantina(data || []);
    })();
    return () => { mounted = false; };
  }, []);

  const updateQty = (key, val) => {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, actual_qty: n } : r)));
  };

  const removeRow = (key) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const addExtra = (product) => {
    setRows((prev) => [
      ...prev,
      {
        key: `extra_${product.id}_${Date.now()}`,
        product_id: product.id,
        product_name: product.name,
        planned_qty: 0,
        actual_qty: 1,
        is_extra: true,
        stock_quantity: product.stock_quantity ?? null,
      },
    ]);
    setShowExtraPicker(false);
    setExtraSearch("");
  };

  const filteredExtraOptions = useMemo(() => {
    const s = extraSearch.trim().toLowerCase();
    return allCantina
      .filter((p) => !s || p.name.toLowerCase().includes(s))
      .slice(0, 30);
  }, [allCantina, extraSearch]);

  // Negative-stock alerts (would result in stock < 0)
  const negativeAlerts = rows.filter(
    (r) => r.actual_qty > 0 && r.stock_quantity != null && r.stock_quantity - r.actual_qty < 0
  );

  // Block confirm if all actual_qty = 0
  const totalNonZero = rows.filter((r) => r.actual_qty > 0).length;
  const canConfirm = !submitting && totalNonZero > 0;

  async function handleSubmit() {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    const payload = rows
      .filter((r) => r.actual_qty > 0)
      .map((r) => ({
        product_id: r.product_id,
        product_name: r.product_name,
        planned_qty: r.planned_qty,
        actual_qty: r.actual_qty,
        is_extra: r.is_extra,
      }));
    try {
      const { data, error: rpcErr } = await supabase.rpc("mark_event_consumed", {
        p_event_id: event.id,
        p_consumptions: payload,
        p_consumed_by: user?.name || "Cantina",
      });
      if (rpcErr) throw rpcErr;
      if (!data?.success) throw new Error(data?.error || "Error desconocido");
      await onConfirmed();
    } catch (e) {
      setError(e.message || "Error inesperado");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-stone-200">
          <div>
            <div className="text-xs text-stone-500 mb-0.5">Marcar evento celebrado</div>
            <div className="text-base font-bold text-stone-800">Confirma cantidades reales consumidas</div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {rows.length === 0 ? (
            <div className="text-center text-stone-400 text-sm py-6">
              Este evento no tiene items de cantina en el plan. Agrega al menos un extra para continuar.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-stone-500 text-xs uppercase">
                <tr>
                  <th className="text-left py-1 font-semibold">Producto</th>
                  <th className="text-right py-1 font-semibold w-20">Plan</th>
                  <th className="text-right py-1 font-semibold w-24">Real</th>
                  <th className="text-center py-1 font-semibold w-28">Stock</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const chip = stockChip(r.stock_quantity, r.actual_qty);
                  return (
                    <tr key={r.key} className="border-t border-stone-100">
                      <td className="py-2 text-stone-700">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{r.product_name}</span>
                          {r.is_extra && (
                            <span className="text-[10px] font-semibold bg-gold/10 text-gold px-1.5 py-0.5 rounded">
                              EXTRA
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-right text-stone-500">{r.planned_qty}</td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={r.actual_qty}
                          onChange={(e) => updateQty(r.key, e.target.value)}
                          className="w-16 border border-stone-200 rounded-md px-2 py-1 text-right text-sm focus:outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 text-center">
                        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${chip.chip}`}>
                          {chip.label}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {r.is_extra && (
                          <button
                            onClick={() => removeRow(r.key)}
                            className="text-stone-400 hover:text-red-500 p-1"
                            title="Quitar extra"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Add extra picker */}
          <div className="pt-2">
            {!showExtraPicker ? (
              <button
                onClick={() => setShowExtraPicker(true)}
                className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium"
              >
                <Plus size={14} /> Agregar item extra
              </button>
            ) : (
              <div className="border border-stone-200 rounded-xl p-3 bg-stone-50/40">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-stone-600">Agregar item extra</div>
                  <button
                    onClick={() => { setShowExtraPicker(false); setExtraSearch(""); }}
                    className="text-stone-400 hover:text-stone-600 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar producto..."
                  value={extraSearch}
                  onChange={(e) => setExtraSearch(e.target.value)}
                  className="w-full border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand mb-2"
                />
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {filteredExtraOptions.length === 0 ? (
                    <div className="text-xs text-stone-400 py-2 text-center">Sin resultados</div>
                  ) : (
                    filteredExtraOptions.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addExtra(p)}
                        className="w-full text-left px-2 py-1.5 hover:bg-white rounded text-sm flex items-center justify-between"
                      >
                        <span className="text-stone-700">{p.name}</span>
                        <span className="text-[11px] text-stone-400">stock {p.stock_quantity ?? "—"}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Negative stock warnings */}
          {negativeAlerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-700 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 space-y-0.5">
                <div className="font-semibold">Stock quedara negativo:</div>
                {negativeAlerts.map((r) => (
                  <div key={r.key}>
                    {r.product_name}: {r.stock_quantity} - {r.actual_qty} = {r.stock_quantity - r.actual_qty}
                  </div>
                ))}
                <div className="text-amber-800 mt-1">Confirma solo si es consumo real (no error).</div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-stone-200 p-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Procesando..." : "Confirmar consumo"}
          </button>
        </div>
      </div>
    </div>
  );
}
