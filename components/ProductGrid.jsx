"use client";

export default function ProductGrid({ products, cart, rate, selectedCategory, onSelectCategory, onAdd }) {
  const categories = ["todos", ...new Set(products.map((p) => p.category || "otro"))];
  const filtered = selectedCategory === "todos"
    ? products
    : products.filter((p) => (p.category || "otro") === selectedCategory);

  const cartMap = {};
  cart.forEach((item) => { cartMap[item.product.id] = item.qty; });

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Category tabs */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-stone-200">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onSelectCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? "bg-brand text-white"
                : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
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
            const outOfStock = product.stock_quantity <= 0;
            const lowStock = product.stock_quantity > 0 && product.stock_quantity <= (product.low_stock_alert || 5);
            const inCart = cartMap[product.id] || 0;

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
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shadow">
                    {inCart}
                  </div>
                )}

                <p className="font-bold text-sm text-stone-800 leading-tight mb-2">
                  {product.name}
                </p>

                <p className="text-lg font-bold text-brand">
                  REF {Number(product.price_ref).toFixed(2)}
                </p>

                {rate && (
                  <p className="text-xs text-stone-400">
                    Bs {(Number(product.price_ref) * rate.eur).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}

                {/* Stock chip */}
                <div className="mt-2">
                  {outOfStock ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                      Sin stock
                    </span>
                  ) : lowStock ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700">
                      Quedan {product.stock_quantity}
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                      Stock: {product.stock_quantity}
                    </span>
                  )}
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
