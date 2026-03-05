"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function InventarioPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restockProduct, setRestockProduct] = useState(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("cantina_user");
    if (!stored) { router.push("/"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (data) setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) loadProducts();
  }, [user, loadProducts]);

  if (!user) return null;

  return (
    <div className="h-screen flex flex-col bg-brand-cream-light overflow-hidden">
      <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between shrink-0">
        <h1 className="font-bold text-brand text-lg flex items-center gap-2">
          <Package size={20} /> Inventario
        </h1>
        <span className="text-xs text-stone-400">{user.name}</span>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-center text-stone-400 text-sm animate-pulse py-12">Cargando productos...</p>
        ) : (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-50 text-stone-500 text-xs">
                  <th className="text-left px-4 py-3 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 font-medium">Categoría</th>
                  <th className="text-center px-4 py-3 font-medium">Stock</th>
                  <th className="text-center px-4 py-3 font-medium">Alerta</th>
                  <th className="text-center px-4 py-3 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const stock = p.stock_quantity ?? 0;
                  const alert = p.low_stock_alert ?? 5;
                  const outOfStock = stock <= 0;
                  const lowStock = stock > 0 && stock <= alert;

                  return (
                    <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50/50">
                      <td className="px-4 py-3 font-medium text-stone-800">{p.name}</td>
                      <td className="px-4 py-3 text-stone-500 capitalize">{p.category || "—"}</td>
                      <td className="px-4 py-3 text-center font-bold">{stock}</td>
                      <td className="px-4 py-3 text-center text-stone-400">{alert}</td>
                      <td className="px-4 py-3 text-center">
                        {outOfStock ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">Sin stock</span>
                        ) : lowStock ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700">Bajo</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">OK</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setRestockProduct(p)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-dark active:scale-95 transition-all"
                        >
                          <Plus size={12} /> Entrada
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {products.length === 0 && (
              <p className="text-center py-8 text-stone-400 text-sm">No hay productos activos</p>
            )}
          </div>
        )}
      </div>

      {/* Restock Modal */}
      {restockProduct && (
        <RestockModal
          product={restockProduct}
          user={user}
          onClose={() => setRestockProduct(null)}
          onSaved={() => { setRestockProduct(null); loadProducts(); }}
        />
      )}
    </div>
  );
}

function RestockModal({ product, user, onClose, onSaved }) {
  const [qty, setQty] = useState("");
  const [costRef, setCostRef] = useState("");
  const [costUsd, setCostUsd] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const quantity = parseInt(qty);
    if (!quantity || quantity <= 0) {
      setError("Ingresa una cantidad válida");
      return;
    }
    setError("");
    setSaving(true);

    try {
      const costPerUnitRef = costRef ? parseFloat(costRef) : null;
      const costPerUnitUsd = costUsd ? parseFloat(costUsd) : null;

      // 1. Insert restock_purchases
      const { error: purchaseError } = await supabase
        .from("restock_purchases")
        .insert({
          product_id: product.id,
          product_name: product.name,
          quantity,
          cost_per_unit_ref: costPerUnitRef,
          cost_per_unit_usd: costPerUnitUsd,
          total_cost_ref: costPerUnitRef ? costPerUnitRef * quantity : null,
          supplier: supplier || null,
          notes: notes || null,
          created_by: user?.name || "Cantina",
        });
      if (purchaseError) throw purchaseError;

      // 2. Insert stock_movement
      const { error: movError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: product.id,
          movement_type: "restock",
          quantity: quantity,
          notes: supplier ? `Proveedor: ${supplier}` : "Restock",
          created_by: user?.name || "Cantina",
        });
      if (movError) throw movError;

      // 3. Update product stock
      const { error: stockError } = await supabase
        .from("products")
        .update({ stock_quantity: (product.stock_quantity ?? 0) + quantity })
        .eq("id", product.id);
      if (stockError) throw stockError;

      onSaved();
    } catch (err) {
      setError("Error: " + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
          <h3 className="font-bold text-sm">Registrar entrada — {product.name}</h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-200 rounded"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-stone-50 rounded-lg p-3 text-xs text-stone-500">
            Stock actual: <strong className="text-stone-700">{product.stock_quantity ?? 0}</strong>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Cantidad recibida *</label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              placeholder="Ej: 24"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Costo/unidad REF</label>
              <input
                type="number"
                step="0.01"
                value={costRef}
                onChange={(e) => setCostRef(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 block mb-1">Costo/unidad USD</label>
              <input
                type="number"
                step="0.01"
                value={costUsd}
                onChange={(e) => setCostUsd(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Proveedor</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500 block mb-1">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              placeholder="Opcional"
            />
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200">
            <p className="text-xs text-red-600 font-medium">{error}</p>
          </div>
        )}

        <div className="px-4 py-3 border-t border-stone-200 flex gap-2">
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded text-sm font-medium disabled:opacity-50 flex items-center gap-1"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : "Registrar entrada"}
          </button>
        </div>
      </div>
    </div>
  );
}
