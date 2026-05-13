"use client";
import { useState, useEffect } from "react";
import { X, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function DeleteProductModal({ product, user, onClose, onDeleted }) {
  const [checking, setChecking] = useState(true);
  const [blocker, setBlocker] = useState(null); // { type, message } | null
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function checkBlockers() {
      if (!supabase || !product) return;

      // Block 1: producto canjeable activo
      if (product.is_redeemable) {
        if (!cancelled) {
          setBlocker({
            type: "redeemable",
            message: "Este producto está marcado como premio canjeable. Desmárcalo como premio primero (tab Puntos → Configuración).",
          });
          setChecking(false);
        }
        return;
      }

      // Block 2: ingrediente de receta activa
      const { data: recipeRows, error: recErr } = await supabase
        .from("product_recipes")
        .select("product_id, products!product_recipes_product_id_fkey(name, has_recipe, active)")
        .eq("ingredient_id", product.id);

      if (cancelled) return;

      if (recErr) {
        setError("Error verificando recetas: " + recErr.message);
        setChecking(false);
        return;
      }

      const activeRecipes = (recipeRows || []).filter(
        (r) => r.products?.active && r.products?.has_recipe
      );

      if (activeRecipes.length > 0) {
        const names = activeRecipes.map((r) => r.products.name).slice(0, 3).join(", ");
        const extra = activeRecipes.length > 3 ? ` y ${activeRecipes.length - 3} mas` : "";
        setBlocker({
          type: "recipe",
          message: `Este producto es ingrediente de ${activeRecipes.length} receta${activeRecipes.length !== 1 ? "s" : ""} activa${activeRecipes.length !== 1 ? "s" : ""} (${names}${extra}). Elimina o modifica esas recetas primero.`,
        });
      }

      setChecking(false);
    }
    checkBlockers();
    return () => { cancelled = true; };
  }, [product]);

  async function handleDelete() {
    if (!supabase || !product || deleting) return;
    setDeleting(true);
    setError("");

    const { error: updErr } = await supabase
      .from("products")
      .update({ active: false })
      .eq("id", product.id);

    if (updErr) {
      setError("Error eliminando: " + updErr.message);
      setDeleting(false);
      return;
    }

    onDeleted();
  }

  const canDelete = !checking && !blocker;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="font-bold text-stone-800 flex items-center gap-2">
            <Trash2 size={16} className="text-red-600" /> Eliminar producto
          </h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600" disabled={deleting}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-stone-700">
            Producto: <span className="font-semibold">{product?.name}</span>
          </p>

          {checking && (
            <div className="flex items-center gap-2 text-xs text-stone-500 py-2">
              <Loader2 size={14} className="animate-spin" /> Verificando dependencias...
            </div>
          )}

          {blocker && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">{blocker.message}</p>
            </div>
          )}

          {canDelete && (
            <p className="text-xs text-stone-600">
              Estas seguro de eliminar <span className="font-semibold">{product?.name}</span>? Esta accion no se puede deshacer.
            </p>
          )}

          {canDelete && (
            <p className="text-[11px] text-stone-400">
              El producto desaparece de la lista pero las ventas y movimientos historicos se preservan.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
          )}
        </div>

        <div className="flex gap-2 px-5 py-3 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
            disabled={deleting}
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-stone-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {deleting ? <><Loader2 size={14} className="animate-spin" /> Eliminando...</> : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
