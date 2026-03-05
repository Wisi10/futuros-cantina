"use client";
import { useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { formatBs } from "@/lib/utils";

const CATEGORY_EMOJIS = {
  Snacks: "🍪",
  Bebida: "🥤",
  Helados: "🍦",
  Platos: "🍽️",
  Pasapalos: "🥟",
  Yogurt: "🥛",
  Carameleria: "🍬",
};

export default function ProductGrid({ products, cart, rate, onAdd }) {
  const [view, setView] = useState("categories"); // "categories" | "products"
  const [activeCategory, setActiveCategory] = useState(null);

  // Build category list with counts
  const categoryMap = {};
  products.forEach((p) => {
    const cat = p.category || "Otro";
    if (!categoryMap[cat]) categoryMap[cat] = 0;
    categoryMap[cat]++;
  });
  const categories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);

  // Cart lookup
  const cartMap = {};
  cart.forEach((item) => {
    cartMap[item.product.id] = item.qty;
  });

  const handleCategoryTap = (cat) => {
    setActiveCategory(cat);
    setView("products");
  };

  const handleShowAll = () => {
    setActiveCategory(null);
    setView("products");
  };

  const handleBack = () => {
    setView("categories");
    setActiveCategory(null);
  };

  const filtered = activeCategory
    ? products.filter((p) => (p.category || "Otro") === activeCategory)
    : products;

  // ── Category Grid ──
  if (view === "categories") {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map(([cat, count]) => {
              const emoji = CATEGORY_EMOJIS[cat] || "🍽️";
              return (
                <button
                  key={cat}
                  onClick={() => handleCategoryTap(cat)}
                  className="bg-white rounded-2xl border-2 border-stone-200 px-4 py-6 flex flex-col items-center justify-center gap-2 transition-all hover:border-brand hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]"
                  style={{ minHeight: 130 }}
                >
                  <span className="text-4xl">{emoji}</span>
                  <span className="text-[15px] font-bold text-stone-800">{cat}</span>
                  <span className="text-[11px] text-stone-400">{count} productos</span>
                </button>
              );
            })}

            {/* Ver todos */}
            <button
              onClick={handleShowAll}
              className="bg-white rounded-2xl border-2 border-stone-200 px-4 py-6 flex flex-col items-center justify-center gap-2 transition-all hover:border-brand hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]"
              style={{ minHeight: 130 }}
            >
              <span className="text-4xl"><Search size={36} className="text-stone-400" /></span>
              <span className="text-[15px] font-bold text-stone-800">Ver todos</span>
              <span className="text-[11px] text-stone-400">{products.length} productos</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Product Grid ──
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header with back button */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 bg-white">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-brand font-medium hover:text-brand-dark transition-colors"
        >
          <ArrowLeft size={16} />
          Categorías
        </button>
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <span>{CATEGORY_EMOJIS[activeCategory] || "🔍"}</span>
          <span className="font-bold">{activeCategory || "Todos"}</span>
          <span className="text-stone-400">({filtered.length} productos)</span>
        </div>
      </div>

      {/* Products */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((product) => {
            const stock = product.stock_quantity ?? 0;
            const alert = product.low_stock_alert ?? 5;
            const outOfStock = stock <= 0;
            const lowStock = stock > 0 && stock <= alert;
            const inCart = cartMap[product.id] || 0;
            const emoji = product.emoji || "🍽️";

            const maxStock = Math.max(alert * 3, 20);
            const stockPct = Math.min((stock / maxStock) * 100, 100);
            const barColor = outOfStock ? "bg-red-400" : lowStock ? "bg-yellow-400" : "bg-green-400";

            return (
              <button
                key={product.id}
                onClick={() => !outOfStock && onAdd(product)}
                disabled={outOfStock}
                className={`relative bg-white rounded-xl border-2 p-3 text-left transition-all ${
                  outOfStock
                    ? "opacity-40 cursor-not-allowed border-stone-200"
                    : "border-stone-200 hover:border-brand hover:shadow-md active:scale-[0.97]"
                }`}
              >
                {/* Cart badge */}
                {inCart > 0 && (
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shadow z-10">
                    {inCart}
                  </div>
                )}

                <div className="text-[28px] mb-1">{emoji}</div>

                <p className="font-semibold text-[11px] text-stone-800 leading-tight mb-1.5 line-clamp-2">
                  {product.name}
                </p>

                <p className="text-sm font-bold text-brand">
                  REF {Number(product.price_ref).toFixed(2)}
                </p>

                {rate && (
                  <p className="text-[10px] text-stone-400">
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
