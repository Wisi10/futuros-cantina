"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { formatBs, ProductImage } from "@/lib/utils";

export default function ProductGrid({ products, cart, rate, onAdd }) {
  const [view, setView] = useState("categories");
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState("");

  // Build categories from products — prefer first product with photo per category
  const categoryData = {};
  products.forEach((p) => {
    const cat = p.category || "Otro";
    if (!categoryData[cat]) {
      categoryData[cat] = { count: 0, emoji: p.emoji || "🍽️", photo_url: p.photo_url || null };
    }
    if (!categoryData[cat].photo_url && p.photo_url) {
      categoryData[cat].photo_url = p.photo_url;
    }
    categoryData[cat].count++;
  });
  const categories = Object.entries(categoryData).sort((a, b) => b[1].count - a[1].count);

  // Cart lookup
  const cartMap = {};
  cart.forEach((item) => {
    cartMap[item.product.id] = item.qty;
  });

  const handleCategoryTap = (cat) => {
    setActiveCategory(cat);
    setSearch("");
    setView("products");
  };

  const handleShowAll = () => {
    setActiveCategory(null);
    setSearch("");
    setView("products");
  };

  const handleBack = () => {
    setView("categories");
    setActiveCategory(null);
    setSearch("");
  };

  // Filter by category + search
  let filtered = activeCategory
    ? products.filter((p) => (p.category || "Otro") === activeCategory)
    : products;

  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
  }

  // ── Category Grid ──
  if (view === "categories") {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map(([cat, data]) => (
              <button
                key={cat}
                onClick={() => handleCategoryTap(cat)}
                className="bg-white rounded-2xl border-2 border-[#e5e5e5] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:border-brand hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]"
                style={{ padding: "28px 16px", minHeight: 140 }}
              >
                <ProductImage product={{ photo_url: data.photo_url, emoji: data.emoji }} size={40} className="rounded-lg" />
                <span className="text-[15px] font-bold text-[#1a1a1a]">{cat}</span>
                <span className="text-[11px] text-[#a3a3a3]">{data.count} productos</span>
              </button>
            ))}

            {/* Ver todos */}
            <button
              onClick={handleShowAll}
              className="bg-white rounded-2xl border-2 border-[#e5e5e5] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:border-brand hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]"
              style={{ padding: "28px 16px", minHeight: 140 }}
            >
              <span className="text-4xl leading-none">🔍</span>
              <span className="text-[15px] font-bold text-[#1a1a1a]">Ver todos</span>
              <span className="text-[11px] text-[#a3a3a3]">{products.length} productos</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Product Grid ──
  const headerCat = activeCategory ? categoryData[activeCategory] : null;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header with back button + search */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 border-b border-stone-200 bg-white sticky top-0 z-10 flex-wrap md:flex-nowrap">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-[12px] md:text-[13px] font-semibold text-brand rounded-lg px-2 md:px-3 py-1.5 md:py-2 bg-brand-cream hover:bg-stone-200 transition-colors shrink-0"
        >
          ← Categorias
        </button>
        <div className="flex items-center gap-1.5 md:gap-2 text-sm text-stone-600 shrink-0">
          {headerCat ? <ProductImage product={{ photo_url: headerCat.photo_url, emoji: headerCat.emoji }} size={18} /> : <span>🔍</span>}
          <span className="font-bold text-xs md:text-sm">{activeCategory || "Todos"}</span>
          <span className="text-stone-400 text-xs">({filtered.length})</span>
        </div>
        <div className="flex-1 max-w-full md:max-w-xs ml-auto relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full border border-stone-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:border-brand focus:outline-none bg-white"
          />
        </div>
      </div>

      {/* Products */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((product) => {
            const stock = product.stock_quantity ?? 0;
            const alertThreshold = product.low_stock_alert ?? 5;
            const outOfStock = stock <= 0;
            const lowStock = stock > 0 && stock <= alertThreshold;
            const inCart = cartMap[product.id] || 0;
            return (
              <button
                key={product.id}
                onClick={() => !outOfStock && onAdd(product)}
                disabled={outOfStock}
                className={`relative bg-white rounded-xl border-2 p-3 flex flex-col items-center text-center transition-all ${
                  outOfStock
                    ? "opacity-40 cursor-not-allowed border-[#e5e5e5] pointer-events-none"
                    : "border-[#e5e5e5] hover:border-brand hover:shadow-md active:scale-[0.97] cursor-pointer"
                }`}
              >
                {/* Cart badge */}
                {inCart > 0 && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-brand text-brand-cream text-[10px] font-bold flex items-center justify-center shadow z-10">
                    {inCart}
                  </div>
                )}

                <div className="mb-1"><ProductImage product={product} size={36} className="rounded-lg" /></div>

                <p className="font-semibold text-[11px] text-stone-800 leading-tight mb-1.5 line-clamp-2 w-full">
                  {product.name}
                </p>

                <p className="text-sm font-bold text-brand">
                  REF {Number(product.price_ref).toFixed(2)}
                </p>

                {rate && (
                  <p className="text-[10px] text-[#a3a3a3]">
                    {formatBs(product.price_ref, rate.eur)}
                  </p>
                )}

                {/* Stock badge */}
                <div className="mt-1.5">
                  {outOfStock ? (
                    <span className="inline-block text-[9px] font-medium px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626]">
                      sin stock
                    </span>
                  ) : lowStock ? (
                    <span className="inline-block text-[9px] font-medium px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#d97706]">
                      ⚠ stk {stock}
                    </span>
                  ) : (
                    <span className="inline-block text-[9px] font-medium px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#16a34a]">
                      stk {stock}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-stone-400 text-sm">
            {search.trim() ? `Sin resultados para "${search}"` : "No hay productos en esta categoria"}
          </div>
        )}
      </div>
    </div>
  );
}
