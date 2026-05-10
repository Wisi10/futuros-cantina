"use client";
import { useState, useEffect, useCallback } from "react";
import { Package, Search, AlertTriangle, PackageX, DollarSign, Truck, ChevronDown, Camera, Upload, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadProductPhoto, ProductImage, calculateProfitability } from "@/lib/utils";
import StockAdjustModal from "./StockAdjustModal";
import RestockForm from "./RestockForm";
import CreateProductModal from "./CreateProductModal";
import RecipeEditor from "./RecipeEditor";

export default function InventarioView({ user }) {
  const [scope, setScope] = useState("productos"); // "productos" | "materia" | "eventos"
  const [subTab, setSubTab] = useState("stock");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState(null);
  const [recipeEditing, setRecipeEditing] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [kpiFilter, setKpiFilter] = useState(null); // "sin_stock" | "stock_bajo" | null
  const [restocks, setRestocks] = useState([]);
  const [expandedSupplier, setExpandedSupplier] = useState(null);
  const [uploading, setUploading] = useState(null); // product id being uploaded
  const [photoSearch, setPhotoSearch] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    let q = supabase.from("products").select("*").order("stock_quantity", { ascending: true });
    if (scope === "productos") {
      q = q.eq("is_cantina", true);
    } else if (scope === "materia") {
      q = q.eq("is_cantina", false).eq("category", "Materia Prima");
    } else if (scope === "eventos") {
      q = q.eq("is_cantina", false).neq("category", "Materia Prima");
    }
    const { data } = await q;
    if (data) setProducts(data);
    setLoading(false);
  }, [scope]);

  const loadRestocks = useCallback(async () => {
    if (!supabase) return;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0];
    const { data } = await supabase
      .from("cantina_restocks")
      .select("*")
      .gte("restock_date", dateStr)
      .order("restock_date", { ascending: false });
    if (data) setRestocks(data);
  }, []);

  useEffect(() => {
    loadProducts();
    loadRestocks();
  }, [loadProducts, loadRestocks]);

  // Reset subtab if scope is eventos and user was in entrada
  useEffect(() => {
    if (scope === "eventos" && subTab === "entrada") setSubTab("stock");
  }, [scope, subTab]);

  // Categories from products
  const categories = ["todos", ...new Set(products.map((p) => p.category || "Otro"))];

  // KPIs
  const sinStockCount = products.filter((p) => Number(p.stock_quantity || 0) <= 0).length;
  const stockBajoCount = products.filter((p) => {
    const stock = Number(p.stock_quantity || 0);
    return stock > 0 && stock <= (p.low_stock_alert || 5);
  }).length;
  const valorTotal = products.reduce(
    (sum, p) => sum + Number(p.stock_quantity || 0) * Number(p.cost_ref || 0), 0
  );
  const pagadoProveedores = restocks.reduce(
    (sum, r) => sum + Number(r.total_cost_ref || 0), 0
  );

  // Filtering
  const filtered = products.filter((p) => {
    // KPI filter
    if (kpiFilter === "sin_stock" && Number(p.stock_quantity || 0) > 0) return false;
    if (kpiFilter === "stock_bajo") {
      const stock = Number(p.stock_quantity || 0);
      if (!(stock > 0 && stock <= (p.low_stock_alert || 5))) return false;
    }
    // Category filter
    if (selectedCategory !== "todos" && (p.category || "Otro") !== selectedCategory) return false;
    // Search filter
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalValue = filtered.reduce(
    (sum, p) => sum + Number(p.stock_quantity || 0) * Number(p.cost_ref || 0), 0
  );

  const rowBg = (p) => {
    const stock = Number(p.stock_quantity || 0);
    if (stock <= 0) return "bg-red-50";
    if (stock <= (p.low_stock_alert || 5)) return "bg-yellow-50";
    return "";
  };

  const stockBadge = (p) => {
    const stock = Number(p.stock_quantity || 0);
    if (stock <= 0) return <span className="text-[10px] font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">Sin stock</span>;
    if (stock <= (p.low_stock_alert || 5)) return <span className="text-[10px] font-medium text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded-full">Bajo</span>;
    return <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">OK</span>;
  };

  const handleKpiClick = (filter) => {
    if (kpiFilter === filter) {
      setKpiFilter(null);
    } else {
      setKpiFilter(filter);
      setSelectedCategory("todos");
    }
  };

  const handleCategoryClick = (cat) => {
    setSelectedCategory(cat);
    setKpiFilter(null);
  };

  // Supplier breakdown
  const supplierData = {};
  restocks.forEach((r) => {
    const supplier = r.supplier || "Sin proveedor";
    if (!supplierData[supplier]) {
      supplierData[supplier] = { total: 0, count: 0, items: {} };
    }
    supplierData[supplier].total += Number(r.total_cost_ref || 0);
    supplierData[supplier].count++;
    const items = r.items || [];
    items.forEach((item) => {
      const name = item.name || "?";
      supplierData[supplier].items[name] = (supplierData[supplier].items[name] || 0) + (item.qty || 0);
    });
  });
  const suppliers = Object.entries(supplierData).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h1 className="font-bold text-brand text-lg flex items-center gap-2">
            <Package size={20} /> Inventario
          </h1>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark transition-colors flex items-center gap-1.5"
          >
            <Plus size={14} /> Crear producto
          </button>
        </div>
        {/* Scope toggle: productos / materia prima / eventos */}
        <div className="flex gap-1 mb-2 border-b border-stone-200">
          <button
            onClick={() => setScope("productos")}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              scope === "productos" ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            Productos
          </button>
          <button
            onClick={() => setScope("materia")}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              scope === "materia" ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            Materia Prima
          </button>
          <button
            onClick={() => setScope("eventos")}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              scope === "eventos" ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            Eventos
          </button>
        </div>
        {scope === "eventos" && (
          <p className="text-xs text-stone-500 mb-2">Items utilizados en eventos / combos cumpleanos. No se compran como inventario fisico.</p>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSubTab("stock")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === "stock" ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            Stock actual
          </button>
          {scope !== "eventos" && (
            <button
              onClick={() => setSubTab("entrada")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                subTab === "entrada" ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              Registrar entrada
            </button>
          )}
          <button
            onClick={() => setSubTab("fotos")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              subTab === "fotos" ? "bg-brand text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            <Camera size={14} /> Fotos
          </button>
        </div>
      </div>

      {/* Sub-tab content */}
      {subTab === "stock" && (
        <div className="flex-1 overflow-auto px-6 pb-6 space-y-4">
          {loading ? (
            <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando...</p>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  onClick={() => handleKpiClick("sin_stock")}
                  className={`bg-white rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                    kpiFilter === "sin_stock" ? "border-brand ring-1 ring-brand" : "border-[#e5e5e5]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <PackageX size={16} className="text-stone-400" />
                    <span className="text-[11px] text-[#a3a3a3] font-medium">Sin stock</span>
                  </div>
                  <p className={`text-2xl font-extrabold ${sinStockCount > 0 ? "text-[#dc2626]" : "text-stone-400"}`}>
                    {sinStockCount}
                  </p>
                  <p className="text-[11px] text-[#a3a3a3]">productos</p>
                </button>

                <button
                  onClick={() => handleKpiClick("stock_bajo")}
                  className={`bg-white rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                    kpiFilter === "stock_bajo" ? "border-brand ring-1 ring-brand" : "border-[#e5e5e5]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-stone-400" />
                    <span className="text-[11px] text-[#a3a3a3] font-medium">Stock bajo</span>
                  </div>
                  <p className={`text-2xl font-extrabold ${stockBajoCount > 0 ? "text-[#dc2626]" : "text-stone-400"}`}>
                    {stockBajoCount}
                  </p>
                  <p className="text-[11px] text-[#a3a3a3]">productos</p>
                </button>

                <div className="bg-white rounded-xl border border-[#e5e5e5] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign size={16} className="text-stone-400" />
                    <span className="text-[11px] text-[#a3a3a3] font-medium">Valor total</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1a1a1a]">
                    REF {valorTotal.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-[#a3a3a3]">inventario</p>
                </div>

                <div className="bg-white rounded-xl border border-[#e5e5e5] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck size={16} className="text-stone-400" />
                    <span className="text-[11px] text-[#a3a3a3] font-medium">Pagado a proveedores</span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#1a1a1a]">
                    REF {pagadoProveedores.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-[#a3a3a3]">ultimos 30d</p>
                </div>
              </div>

              {/* Category filter buttons */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleCategoryClick(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                      selectedCategory === cat && !kpiFilter
                        ? "bg-brand text-brand-cream border-brand"
                        : "bg-white text-[#525252] border-[#e5e5e5] hover:bg-stone-50"
                    }`}
                  >
                    {cat === "todos" ? "Todos" : cat}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
                />
              </div>

              {/* Active filter indicator */}
              {kpiFilter && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-500">
                    Filtro: <span className="font-semibold text-brand">{kpiFilter === "sin_stock" ? "Sin stock" : "Stock bajo"}</span>
                  </span>
                  <button
                    onClick={() => setKpiFilter(null)}
                    className="text-xs text-brand hover:underline"
                  >
                    Limpiar
                  </button>
                </div>
              )}

              {/* Product table */}
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="bg-stone-50 text-stone-500 text-xs">
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-left px-3 py-2 font-medium">Categoria</th>
                      <th className="text-right px-3 py-2 font-medium">Stock</th>
                      <th className="text-right px-3 py-2 font-medium">Alerta</th>
                      <th className="text-right px-3 py-2 font-medium">Costo REF</th>
                      <th className="text-right px-3 py-2 font-medium hidden md:table-cell">Margen</th>
                      <th className="text-center px-3 py-2 font-medium">Estado</th>
                      <th className="text-right px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const profit = calculateProfitability(p.price_ref, p.cost_ref);
                      return (
                      <tr key={p.id} className={`border-t border-stone-100 ${rowBg(p)}`}>
                        <td className="px-3 py-2 font-medium text-stone-800">
                          <span className="mr-1.5 inline-flex"><ProductImage product={p} size={20} /></span>{p.name}
                        </td>
                        <td className="px-3 py-2 text-stone-500 text-xs">{p.category || "—"}</td>
                        <td className="px-3 py-2 text-right font-bold">{Number(p.stock_quantity || 0)}</td>
                        <td className="px-3 py-2 text-right text-stone-400">{p.low_stock_alert || 5}</td>
                        <td className="px-3 py-2 text-right text-stone-500">{Number(p.cost_ref || 0).toFixed(2)}</td>
                        <td className={`px-3 py-2 text-right text-xs hidden md:table-cell font-medium ${profit.color}`}>{profit.display}</td>
                        <td className="px-3 py-2 text-center">{stockBadge(p)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {scope === "productos" && (
                              <button
                                onClick={() => setRecipeEditing(p)}
                                className={`text-xs hover:underline ${p.has_recipe ? "text-amber-700 font-semibold" : "text-stone-500"}`}
                                title={p.has_recipe ? "Tiene receta" : "Sin receta"}
                              >
                                {p.has_recipe ? "Receta" : "+ Receta"}
                              </button>
                            )}
                            <button
                              onClick={() => setAdjusting(p)}
                              className="text-xs text-brand hover:underline"
                            >
                              Ajustar
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-stone-400 text-xs">
                          No hay productos con este filtro
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-stone-200 bg-stone-50">
                      <td colSpan={4} className="px-3 py-2 text-sm font-bold text-stone-700 text-right">
                        Valor total inventario:
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-brand" colSpan={1}>
                        REF {totalValue.toFixed(2)}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table></div>
              </div>

              {/* Supplier section — only when "Todos" and no kpiFilter */}
              {selectedCategory === "todos" && !kpiFilter && (
                <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-100">
                    <h3 className="text-sm font-bold text-stone-700 flex items-center gap-2">
                      <Truck size={16} /> Compras por proveedor — ultimos 30 dias
                    </h3>
                  </div>

                  {suppliers.length === 0 ? (
                    <div className="px-4 py-8 text-center text-stone-400 text-xs">
                      Sin compras registradas en este periodo
                    </div>
                  ) : (
                    <div className="divide-y divide-stone-100">
                      {suppliers.map(([supplier, data]) => {
                        const topItems = Object.entries(data.items)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 3)
                          .map(([name]) => name);
                        const expanded = expandedSupplier === supplier;

                        return (
                          <div key={supplier}>
                            <button
                              onClick={() => setExpandedSupplier(expanded ? null : supplier)}
                              className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-stone-50 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-stone-800">{supplier}</p>
                                <p className="text-[11px] text-stone-400 truncate">
                                  {topItems.join(", ")}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold text-brand">REF {data.total.toFixed(2)}</p>
                                <p className="text-[11px] text-stone-400">{data.count} entrada{data.count !== 1 ? "s" : ""}</p>
                              </div>
                              <ChevronDown
                                size={14}
                                className={`text-stone-300 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
                              />
                            </button>

                            {expanded && (
                              <div className="px-4 pb-3 bg-stone-50">
                                <div className="overflow-x-auto"><table className="w-full text-xs min-w-[400px]">
                                  <thead>
                                    <tr className="text-stone-400">
                                      <th className="text-left py-1 font-medium">Fecha</th>
                                      <th className="text-left py-1 font-medium">Items</th>
                                      <th className="text-right py-1 font-medium">Total REF</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {restocks
                                      .filter((r) => (r.supplier || "Sin proveedor") === supplier)
                                      .map((r) => (
                                        <tr key={r.id} className="border-t border-stone-200">
                                          <td className="py-1.5 text-stone-500">{r.restock_date}</td>
                                          <td className="py-1.5 text-stone-600">
                                            {(r.items || []).map((i) => `${i.name} x${i.qty}`).join(", ")}
                                          </td>
                                          <td className="py-1.5 text-right font-semibold text-stone-700">
                                            REF {Number(r.total_cost_ref || 0).toFixed(2)}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {subTab === "entrada" && (
        <div className="flex-1 overflow-auto px-6 pb-6">
          <RestockForm
            products={products}
            user={user}
            onRestocked={loadProducts}
          />
        </div>
      )}

      {subTab === "fotos" && (
        <div className="flex-1 overflow-auto px-6 pb-6">
          <div className="mb-4 relative max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input type="text" value={photoSearch} onChange={e => setPhotoSearch(e.target.value)}
              placeholder="Buscar producto..." className="w-full border border-stone-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:border-brand focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {products
              .filter(p => p.is_cantina)
              .filter(p => !photoSearch || p.name.toLowerCase().includes(photoSearch.toLowerCase()))
              .map(p => (
                <div key={p.id} className="bg-white rounded-xl border-2 border-stone-200 p-3 flex flex-col items-center text-center">
                  {/* Photo or emoji */}
                  <div className="w-20 h-20 rounded-lg bg-stone-100 flex items-center justify-center mb-2 overflow-hidden">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">{p.emoji || "🍽️"}</span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-stone-700 leading-tight mb-2 line-clamp-2 w-full">{p.name}</p>
                  <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                    uploading === p.id ? "bg-stone-200 text-stone-400" : p.photo_url ? "bg-stone-100 text-stone-600 hover:bg-stone-200" : "bg-gold/10 text-gold hover:bg-gold/20"
                  }`}>
                    {uploading === p.id ? (
                      "Subiendo..."
                    ) : (
                      <>
                        <Upload size={12} />
                        {p.photo_url ? "Cambiar" : "Subir foto"}
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" disabled={uploading === p.id}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !supabase) return;
                        setUploading(p.id);
                        try {
                          const url = await uploadProductPhoto(supabase, p.id, file);
                          setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, photo_url: url } : prod));
                        } catch (err) {
                          alert("Error subiendo foto: " + err.message);
                        }
                        setUploading(null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              ))}
          </div>
          {products.filter(p => p.is_cantina).length === 0 && (
            <p className="text-sm text-stone-400 text-center py-8">No hay productos de Comida o Bebida</p>
          )}
        </div>
      )}

      {/* Adjust modal */}
      {adjusting && (
        <StockAdjustModal
          product={adjusting}
          user={user}
          onClose={() => setAdjusting(null)}
          onSaved={() => { setAdjusting(null); loadProducts(); }}
        />
      )}

      {/* Recipe editor modal */}
      {recipeEditing && (
        <RecipeEditor
          product={recipeEditing}
          user={user}
          onClose={() => setRecipeEditing(null)}
          onSaved={() => { setRecipeEditing(null); loadProducts(); }}
        />
      )}

      {/* Create product modal */}
      {createModalOpen && (
        <CreateProductModal
          user={user}
          onClose={() => setCreateModalOpen(false)}
          onCreated={async () => { await loadProducts(); }}
        />
      )}
    </div>
  );
}
