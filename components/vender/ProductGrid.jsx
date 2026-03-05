"use client";
import { formatBs } from "@/lib/utils";

export default function ProductGrid({ products, cart, rate, selectedCategory, onSelectCategory, onAdd }) {
  const categories = ["todos", ...new Set(products.map((p) => p.category || "otro"))];
  const filtered =
    selectedCategory === "todos"
      ? products
      : products.filter((p) => (p.category || "otro") === selectedCategory);

  const cartMap = {};
  cart.forEach((item) => {
    cartMap[item.product.id] = item.qty;
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Category tabs */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-stone-200 bg-white">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onSelectCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? "bg-brand text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {cat === "todos" ? "Todos" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((product) => {
            const stock = product.stock_quantity ?? 0;
            const alert = product.low_stock_alert ?? 5;
            const outOfStock = stock <= 0;
            const lowStock = stock > 0 && stock <= alert;
            const inCart = cartMap[product.id] || 0;
            const emoji = product.emoji || "🍽️";

            // Stock bar percentage
            const maxStock = Math.max(alert * 3, 20);
            const stockPct = Math.min((stock / maxStock) * 100, 100);
            const barColor = outOfStock ? "bg-red-400" : lowStock ? "bg-yellow-400" : "bg-green-400";

            return (
              <button
                key={product.id}
                onClick={() => !outOfStock && onAdd(product)}
                disabled={outOfStock}
                className={`relative bg-white rounded-xl border p-3 text-left transition-all ${
                  outOfStock
                    ? "opacity-40 cursor-not-allowed border-stone-200"
                    : "border-stone-200 hover:border-brand hover:shadow-md active:scale-[0.97]"
                }`}
                style={{ minHeight: 140 }}
              >
                {/* Cart badge */}
                {inCart > 0 && (
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shadow z-10">
                    {inCart}
                  </div>
                )}

                <div className="text-2xl mb-1">{emoji}</div>

                <p className="font-bold text-sm text-stone-800 leading-tight mb-1.5">
                  {product.name}
                </p>

                <p className="text-lg font-bold text-brand">
                  REF {Number(product.price_ref).toFixed(2)}
                </p>

                {rate && (
                  <p className="text-xs text-stone-400">
                    {formatBs(product.price_ref, rate.eur)}
                  </p>
                )}

                {/* Stock bar */}
                <div className="mt-2">
                  <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${stockPct}%` }} />
                  </div>
                  <p className={`text-[10px] mt-0.5 font-medium ${outOfStock ? "text-red-500" : lowStock ? "text-yellow-600" : "text-stone-400"}`}>
                    {outOfStock ? "Sin stock" : `stock ${stock}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-stone-400 text-sm">
            No hay productos en esta categoría
          </div>
        )}
      </div>
    </div>
  );
}
