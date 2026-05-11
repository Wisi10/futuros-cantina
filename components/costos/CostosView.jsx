"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  TrendingUp, TrendingDown, Minus, Search, AlertTriangle, Package2,
  Truck, ChevronDown, BarChart3, ArrowUpRight, ArrowDownRight, Trophy, Download
} from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Filler, Tooltip as ChartTooltip, Legend
} from "chart.js";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { formatREF, ProductImage } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, ChartTooltip, Legend);

// Mini sparkline SVG — historia de precios en linea pequena
function Sparkline({ points, width = 60, height = 18, color = "#B8963E" }) {
  if (!points || points.length < 2) return <span className="text-stone-300 text-[10px]">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const lastX = (points.length - 1) * stepX;
  const lastY = height - ((last - min) / range) * height;
  const trendUp = points[points.length - 1] > points[0];
  const stroke = trendUp ? "#dc2626" : "#16a34a";
  return (
    <svg width={width} height={height} className="inline-block align-middle" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="1.5" fill={stroke} />
    </svg>
  );
}

const SUB_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "evolucion", label: "Evolucion" },
  { id: "productos", label: "Productos" },
  { id: "materia", label: "Materia Prima" },
  { id: "proveedores", label: "Proveedores" },
];

// Paleta de colores para multi-line chart
const LINE_COLORS = [
  "#B8963E", "#4D1A2A", "#16a34a", "#dc2626", "#0891b2",
  "#7c3aed", "#ea580c", "#0f766e", "#a16207", "#be123c",
];

const variationColor = (pct) => {
  if (pct == null) return "text-stone-400";
  if (pct >= 15) return "text-red-600";
  if (pct >= 5) return "text-amber-600";
  if (pct <= -5) return "text-green-600";
  return "text-stone-500";
};

const variationIcon = (pct) => {
  if (pct == null || Math.abs(pct) < 0.5) return <Minus size={12} className="text-stone-300" />;
  return pct > 0
    ? <TrendingUp size={12} className="text-red-500" />
    : <TrendingDown size={12} className="text-green-500" />;
};

const marginColor = (pct) => {
  if (pct == null) return "text-stone-400";
  if (pct >= 50) return "text-green-600";
  if (pct >= 25) return "text-amber-600";
  return "text-red-500";
};

const marginPct = (price, cost) => {
  if (!price || price <= 0) return null;
  return ((price - cost) / price) * 100;
};

export default function CostosView({ user }) {
  const [subTab, setSubTab] = useState("resumen");
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [movements, setMovements] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [sales, setSales] = useState([]);
  const [movementsYear, setMovementsYear] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const isoCutoff = ninetyDaysAgo.toISOString();
    const dateCutoff = isoCutoff.split("T")[0];
    // Para Evolucion: cargar 365d de movimientos restock
    const yearAgo = new Date();
    yearAgo.setDate(yearAgo.getDate() - 365);
    const yearCutoff = yearAgo.toISOString();

    const [productsRes, recipesRes, movementsRes, restocksRes, salesRes, evolutionRes] = await Promise.all([
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("product_recipes").select("*"),
      supabase
        .from("stock_movements")
        .select("id, product_id, product_name, movement_type, quantity, cost_ref, notes, created_at")
        .eq("movement_type", "restock")
        .gte("created_at", isoCutoff)
        .order("created_at", { ascending: false }),
      supabase
        .from("cantina_restocks")
        .select("id, restock_date, items, total_cost_ref, supplier")
        .gte("restock_date", dateCutoff)
        .order("restock_date", { ascending: false }),
      supabase
        .from("cantina_sales")
        .select("id, sale_date, items, total_ref")
        .gte("sale_date", dateCutoff),
      supabase
        .from("stock_movements")
        .select("product_id, product_name, quantity, cost_ref, created_at")
        .eq("movement_type", "restock")
        .gte("created_at", yearCutoff)
        .order("created_at", { ascending: true }),
    ]);
    setMovementsYear(evolutionRes.data || []);

    setProducts(productsRes.data || []);
    setRecipes(recipesRes.data || []);
    setMovements(movementsRes.data || []);
    setRestocks(restocksRes.data || []);
    setSales(salesRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Derived data
  const ingredientIds = useMemo(() => {
    const ids = new Set();
    recipes.forEach((r) => { if (r.ingredient_id) ids.add(r.ingredient_id); });
    return ids;
  }, [recipes]);

  const productById = useMemo(() => {
    const m = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  // Historial de compras por producto
  const priceHistoryByProduct = useMemo(() => {
    const map = {};
    movements.forEach((m) => {
      if (!m.product_id || !m.cost_ref) return;
      if (!map[m.product_id]) map[m.product_id] = [];
      map[m.product_id].push({
        date: m.created_at,
        cost: Number(m.cost_ref || 0),
        qty: Number(m.quantity || 0),
        note: m.notes,
      });
    });
    return map;
  }, [movements]);

  // Costo reemplazo = ultimo costo de compra
  const replacementCostByProduct = useMemo(() => {
    const map = {};
    Object.entries(priceHistoryByProduct).forEach(([pid, hist]) => {
      if (hist.length > 0) map[pid] = hist[0].cost;
    });
    return map;
  }, [priceHistoryByProduct]);

  // Variacion materia prima (replacement vs MAC)
  const variationByProduct = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      const mac = Number(p.cost_ref || 0);
      const replacement = replacementCostByProduct[p.id];
      if (mac > 0 && replacement != null) {
        map[p.id] = ((replacement - mac) / mac) * 100;
      }
    });
    return map;
  }, [products, replacementCostByProduct]);

  const recipesByProduct = useMemo(() => {
    const map = {};
    recipes.forEach((r) => {
      if (!map[r.product_id]) map[r.product_id] = [];
      map[r.product_id].push(r);
    });
    return map;
  }, [recipes]);

  // Costo MAC y reemplazo de cada producto compuesto (con receta)
  const recipeCostByProduct = useMemo(() => {
    const map = {};
    Object.entries(recipesByProduct).forEach(([productId, items]) => {
      let total = 0;
      let totalReplacement = 0;
      const breakdown = [];
      items.forEach((it) => {
        const ing = productById[it.ingredient_id];
        if (!ing) return;
        const ingMAC = Number(ing.cost_ref || 0);
        const ingReplacement = replacementCostByProduct[it.ingredient_id] != null
          ? Number(replacementCostByProduct[it.ingredient_id])
          : ingMAC;
        const qty = Number(it.quantity || 0);
        total += ingMAC * qty;
        totalReplacement += ingReplacement * qty;
        breakdown.push({
          ingredientId: it.ingredient_id,
          name: ing.name,
          qty: it.quantity,
          unit: it.unit,
          ingCost: ingMAC,
          ingReplacement,
          cost: ingMAC * qty,
          replacementCost: ingReplacement * qty,
        });
      });
      map[productId] = { total, totalReplacement, breakdown };
    });
    return map;
  }, [recipesByProduct, productById, replacementCostByProduct]);

  // Productos terminados con margenes calculados
  const productosWithMargin = useMemo(() => {
    return products
      .filter((p) => p.is_cantina && Number(p.price_ref || 0) > 0)
      .map((p) => {
        const price = Number(p.price_ref || 0);
        const recipe = recipeCostByProduct[p.id];
        const macCost = recipe ? recipe.total : Number(p.cost_ref || 0);
        const replacementCost = recipe
          ? recipe.totalReplacement
          : (replacementCostByProduct[p.id] != null ? Number(replacementCostByProduct[p.id]) : macCost);
        const recipeVariation = macCost > 0 ? ((replacementCost - macCost) / macCost) * 100 : null;
        return {
          ...p,
          price,
          macCost,
          replacementCost,
          macMargin: marginPct(price, macCost),
          replMargin: marginPct(price, replacementCost),
          costVariation: recipe ? recipeVariation : variationByProduct[p.id],
          recipe,
        };
      });
  }, [products, recipeCostByProduct, replacementCostByProduct, variationByProduct]);

  // Materia prima
  const materiaPrima = useMemo(() => {
    return products.filter((p) => ingredientIds.has(p.id) || (!p.is_cantina && p.category === "Materia Prima"));
  }, [products, ingredientIds]);

  // Revenue 90d por producto (de cantina_sales.items jsonb)
  const revenueByProduct = useMemo(() => {
    const map = {};
    sales.forEach((s) => {
      (s.items || []).forEach((it) => {
        const pid = it.product_id;
        if (!pid) return;
        const qty = Number(it.qty || it.quantity || 0);
        const price = Number(it.price_per_unit || it.price_ref || it.price || 0);
        const rev = qty * price;
        map[pid] = (map[pid] || 0) + rev;
      });
    });
    return map;
  }, [sales]);

  // Categorias unicas para filtro
  const categorias = useMemo(() => {
    const set = new Set();
    products.filter((p) => p.is_cantina).forEach((p) => set.add(p.category || "Otro"));
    return ["todas", ...Array.from(set).sort()];
  }, [products]);

  // Por proveedor
  const supplierData = useMemo(() => {
    const map = {};
    restocks.forEach((r) => {
      const supplier = r.supplier || "Sin proveedor";
      if (!map[supplier]) map[supplier] = { total: 0, count: 0, items: {} };
      map[supplier].total += Number(r.total_cost_ref || 0);
      map[supplier].count++;
      (r.items || []).forEach((item) => {
        const name = item.name || "?";
        if (!map[supplier].items[name]) map[supplier].items[name] = { qty: 0, count: 0, totalCost: 0 };
        map[supplier].items[name].qty += Number(item.qty || 0);
        map[supplier].items[name].count++;
        map[supplier].items[name].totalCost += Number(item.qty || 0) * Number(item.cost_per_unit_ref || 0);
      });
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [restocks]);

  const handleExport = useCallback(() => {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Hoja 1: Productos con margenes
      const prodRows = productosWithMargin.map((p) => ({
        Producto: p.name,
        Categoria: p.category || "",
        "Precio REF": Number(p.price.toFixed(2)),
        "MAC REF": Number(p.macCost.toFixed(2)),
        "Reemplazo REF": Number(p.replacementCost.toFixed(2)),
        "Margen MAC %": p.macMargin != null ? Number(p.macMargin.toFixed(2)) : null,
        "Margen Reemplazo %": p.replMargin != null ? Number(p.replMargin.toFixed(2)) : null,
        "Variacion Costo %": p.costVariation != null ? Number(p.costVariation.toFixed(2)) : null,
        "Revenue 90d REF": Number((revenueByProduct[p.id] || 0).toFixed(2)),
        "Tiene receta": p.recipe ? "Si" : "No",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prodRows), "Productos");

      // Hoja 2: Materia prima
      const matRows = materiaPrima.map((p) => ({
        Ingrediente: p.name,
        Categoria: p.category || "",
        "Stock": Number(p.stock_quantity || 0),
        "MAC REF": Number(Number(p.cost_ref || 0).toFixed(4)),
        "Ultimo REF": replacementCostByProduct[p.id] != null ? Number(Number(replacementCostByProduct[p.id]).toFixed(4)) : null,
        "Variacion %": variationByProduct[p.id] != null ? Number(variationByProduct[p.id].toFixed(2)) : null,
        "# Compras 90d": (priceHistoryByProduct[p.id] || []).length,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matRows), "Materia Prima");

      // Hoja 3: Por proveedor
      const supRows = supplierData.map(([supplier, data]) => ({
        Proveedor: supplier,
        "Total 90d REF": Number(data.total.toFixed(2)),
        "# Compras": data.count,
        "# Items distintos": Object.keys(data.items).length,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supRows), "Proveedores");

      // Hoja 4: Historial compras (long form)
      const histRows = [];
      movements.forEach((m) => {
        histRows.push({
          Fecha: new Date(m.created_at).toLocaleDateString("es-VE", { timeZone: "America/Caracas" }),
          Producto: m.product_name,
          Cantidad: Number(m.quantity || 0),
          "Costo/u REF": Number(Number(m.cost_ref || 0).toFixed(4)),
          "Total REF": Number((Number(m.quantity || 0) * Number(m.cost_ref || 0)).toFixed(2)),
          Nota: m.notes || "",
        });
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(histRows), "Historial Compras");

      const today = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `costos-${today}.xlsx`);
    } catch (err) {
      alert("Error exportando: " + err.message);
    }
    setExporting(false);
  }, [productosWithMargin, materiaPrima, supplierData, movements, revenueByProduct, replacementCostByProduct, variationByProduct, priceHistoryByProduct]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="font-bold text-brand text-lg flex items-center gap-2">
            <TrendingUp size={20} /> Costos y margenes
          </h1>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 rounded-lg text-xs font-medium text-stone-700 flex items-center gap-1.5 transition-colors"
          >
            <Download size={14} /> {exporting ? "Exportando..." : "Excel"}
          </button>
        </div>

        <div className="flex gap-1 mb-1 border-b border-stone-200">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                subTab === t.id ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando...</p>
        ) : (
          <>
            {subTab === "resumen" && (
              <Resumen
                productosWithMargin={productosWithMargin}
                materiaPrima={materiaPrima}
                variationByProduct={variationByProduct}
                supplierData={supplierData}
                revenueByProduct={revenueByProduct}
                setSubTab={setSubTab}
              />
            )}
            {subTab === "evolucion" && (
              <EvolucionMAC
                movementsYear={movementsYear}
                materiaPrima={materiaPrima}
              />
            )}
            {subTab === "productos" && (
              <ProductosLista
                productos={productosWithMargin}
                categorias={categorias}
              />
            )}
            {subTab === "materia" && (
              <MateriaLista
                items={materiaPrima}
                priceHistoryByProduct={priceHistoryByProduct}
                replacementCostByProduct={replacementCostByProduct}
                variationByProduct={variationByProduct}
              />
            )}
            {subTab === "proveedores" && (
              <ProveedorLista supplierData={supplierData} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// RESUMEN — dashboard principal
// ═══════════════════════════════════════════════════════
function Resumen({ productosWithMargin, materiaPrima, variationByProduct, supplierData, revenueByProduct, setSubTab }) {
  // KPIs
  const productosConPrecio = productosWithMargin.filter((p) => p.macMargin != null);
  // Margen ponderado por revenue (peso real). Si no hay ventas, fallback al simple average.
  const totalRevenue = productosConPrecio.reduce((s, p) => s + (revenueByProduct[p.id] || 0), 0);
  const weightedMargin = totalRevenue > 0
    ? productosConPrecio.reduce((s, p) => s + ((p.macMargin || 0) * (revenueByProduct[p.id] || 0)), 0) / totalRevenue
    : null;
  const simpleAvgMargin = productosConPrecio.length > 0
    ? productosConPrecio.reduce((s, p) => s + (p.macMargin || 0), 0) / productosConPrecio.length
    : null;
  const avgMargin = weightedMargin != null ? weightedMargin : simpleAvgMargin;
  const marginIsWeighted = weightedMargin != null;
  const alertCount = productosWithMargin.filter((p) => p.costVariation != null && p.costVariation >= 15).length;
  const spend30d = supplierData.reduce((s, [, d]) => s + d.total, 0);
  const supplierCount = supplierData.length;

  // Rankings
  const topMargin = [...productosConPrecio].sort((a, b) => (b.macMargin || 0) - (a.macMargin || 0)).slice(0, 5);
  const bottomMargin = [...productosConPrecio].sort((a, b) => (a.macMargin || 0) - (b.macMargin || 0)).slice(0, 5);

  // Materia prima rankings
  const materiaWithVar = materiaPrima
    .map((p) => ({ ...p, variation: variationByProduct[p.id] }))
    .filter((p) => p.variation != null);
  const subiendo = [...materiaWithVar].sort((a, b) => (b.variation || 0) - (a.variation || 0)).slice(0, 5);
  const bajando = [...materiaWithVar].sort((a, b) => (a.variation || 0) - (b.variation || 0)).filter((p) => p.variation < 0).slice(0, 5);

  // Productos en alerta repricing
  const alerts = [...productosWithMargin]
    .filter((p) => p.costVariation != null && p.costVariation >= 15)
    .sort((a, b) => (b.costVariation || 0) - (a.costVariation || 0))
    .slice(0, 6);

  // Chart: spend por proveedor (top 8)
  const topSuppliers = supplierData.slice(0, 8);
  const chartData = {
    labels: topSuppliers.map(([name]) => name.length > 14 ? name.slice(0, 13) + "…" : name),
    datasets: [{
      data: topSuppliers.map(([, d]) => d.total),
      backgroundColor: "#B8963E",
      borderRadius: 6,
      borderSkipped: false,
    }],
  };
  const chartOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (c) => `REF ${Number(c.raw).toFixed(2)}` },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: "#f5f5f4" },
        ticks: { font: { size: 10 }, callback: (v) => `REF ${v}` },
      },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } },
    },
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={marginIsWeighted ? "Margen ponderado" : "Margen promedio"}
          value={avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—"}
          sub={marginIsWeighted ? `${productosConPrecio.length} productos · pond. por ventas` : `${productosConPrecio.length} productos · sin ventas aun`}
          color={avgMargin >= 50 ? "text-green-600" : avgMargin >= 30 ? "text-amber-600" : "text-red-500"}
        />
        <KpiCard
          label="En alerta"
          value={alertCount.toString()}
          sub="repricing sugerido"
          color={alertCount > 0 ? "text-red-600" : "text-stone-500"}
        />
        <KpiCard
          label="Gasto proveedores 90d"
          value={formatREF(spend30d)}
          sub={`${supplierCount} proveedor${supplierCount !== 1 ? "es" : ""}`}
          color="text-stone-700"
        />
        <KpiCard
          label="Productos activos"
          value={productosWithMargin.length.toString()}
          sub="con precio"
          color="text-stone-700"
        />
      </div>

      {/* Alertas de repricing */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="text-sm font-bold text-amber-900">Productos con costo en alza ({alerts.length})</h3>
          </div>
          <div className="space-y-1.5">
            {alerts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-xs bg-white rounded-lg px-3 py-2 border border-amber-100">
                <ProductImage product={p} size={20} />
                <span className="flex-1 truncate font-medium text-stone-700">{p.name}</span>
                <span className="text-stone-500">Margen {p.macMargin?.toFixed(0)}% → {p.replMargin?.toFixed(0)}%</span>
                <span className="font-bold text-red-600 min-w-[50px] text-right">+{p.costVariation?.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rankings de productos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankingCard
          title="Mayor margen"
          icon={<Trophy size={14} className="text-green-600" />}
          items={topMargin}
          renderItem={(p) => (
            <>
              <ProductImage product={p} size={20} />
              <span className="flex-1 truncate text-stone-700">{p.name}</span>
              <span className={`font-bold ${marginColor(p.macMargin)}`}>{p.macMargin?.toFixed(1)}%</span>
            </>
          )}
          emptyText="No hay productos"
        />
        <RankingCard
          title="Menor margen"
          icon={<ArrowDownRight size={14} className="text-red-500" />}
          items={bottomMargin}
          renderItem={(p) => (
            <>
              <ProductImage product={p} size={20} />
              <span className="flex-1 truncate text-stone-700">{p.name}</span>
              <span className={`font-bold ${marginColor(p.macMargin)}`}>{p.macMargin?.toFixed(1)}%</span>
            </>
          )}
          emptyText="No hay productos"
        />
      </div>

      {/* Rankings de materia prima */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankingCard
          title="Materia prima subiendo"
          icon={<ArrowUpRight size={14} className="text-red-500" />}
          items={subiendo}
          renderItem={(p) => (
            <>
              <span className="flex-1 truncate text-stone-700">{p.name}</span>
              <span className="text-stone-400 text-[10px]">{formatREF(Number(p.cost_ref || 0))}</span>
              <span className={`font-bold ${variationColor(p.variation)}`}>+{p.variation?.toFixed(1)}%</span>
            </>
          )}
          emptyText="Sin variaciones"
        />
        <RankingCard
          title="Materia prima bajando"
          icon={<ArrowDownRight size={14} className="text-green-500" />}
          items={bajando}
          renderItem={(p) => (
            <>
              <span className="flex-1 truncate text-stone-700">{p.name}</span>
              <span className="text-stone-400 text-[10px]">{formatREF(Number(p.cost_ref || 0))}</span>
              <span className={`font-bold ${variationColor(p.variation)}`}>{p.variation?.toFixed(1)}%</span>
            </>
          )}
          emptyText="Sin caidas"
        />
      </div>

      {/* Chart proveedores */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-stone-700 flex items-center gap-2">
            <BarChart3 size={14} /> Gasto por proveedor — 90d
          </h3>
          <button
            onClick={() => setSubTab("proveedores")}
            className="text-[11px] text-brand hover:underline"
          >
            Ver detalle →
          </button>
        </div>
        {topSuppliers.length === 0 ? (
          <p className="text-xs text-stone-400 text-center py-6">Sin compras registradas</p>
        ) : (
          <div style={{ height: Math.max(120, topSuppliers.length * 30) }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <p className="text-[10px] uppercase tracking-wider text-stone-400 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-extrabold ${color || "text-stone-700"}`}>{value}</p>
      <p className="text-[10px] text-stone-400 mt-1">{sub}</p>
    </div>
  );
}

function RankingCard({ title, icon, items, renderItem, emptyText }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-6 px-4">{emptyText}</p>
      ) : (
        <div className="divide-y divide-stone-100">
          {items.map((it, i) => (
            <div key={it.id || i} className="px-4 py-2 flex items-center gap-3 text-xs">
              <span className="text-stone-300 font-mono w-4">{i + 1}</span>
              {renderItem(it)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PRODUCTOS LISTA (sort + filter)
// ═══════════════════════════════════════════════════════
function ProductosLista({ productos, categorias }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("margin_desc");
  const [activeCategory, setActiveCategory] = useState("todas");
  const [expandedProduct, setExpandedProduct] = useState(null);

  const sorted = useMemo(() => {
    let list = productos;
    if (activeCategory !== "todas") {
      list = list.filter((p) => (p.category || "Otro") === activeCategory);
    }
    if (search) {
      list = list.filter((p) => (p.name || "").toLowerCase().includes(search.toLowerCase()));
    }
    const cmp = (a, b) => {
      switch (sortKey) {
        case "margin_desc": return (b.macMargin || 0) - (a.macMargin || 0);
        case "margin_asc": return (a.macMargin || 0) - (b.macMargin || 0);
        case "variation_desc": return (b.costVariation || 0) - (a.costVariation || 0);
        case "price_desc": return (b.price || 0) - (a.price || 0);
        case "name_asc": return (a.name || "").localeCompare(b.name || "");
        default: return 0;
      }
    };
    return [...list].sort(cmp);
  }, [productos, search, sortKey, activeCategory]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-brand focus:outline-none"
        >
          <option value="margin_desc">Mayor margen primero</option>
          <option value="margin_asc">Menor margen primero</option>
          <option value="variation_desc">Mayor variacion costo</option>
          <option value="price_desc">Precio descendente</option>
          <option value="name_asc">Alfabetico</option>
        </select>
      </div>

      {categorias && categorias.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {categorias.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                activeCategory === cat
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
              }`}
            >
              {cat === "todas" ? "Todas" : cat}
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-8">No hay productos.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => {
            const expanded = expandedProduct === p.id;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <button
                  onClick={() => setExpandedProduct(expanded ? null : p.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-stone-50 transition-colors"
                >
                  <ProductImage product={p} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{p.name}</p>
                    <p className="text-[11px] text-stone-400">{p.category || "—"} · {formatREF(p.price)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-wider text-stone-400">Margen</p>
                    <p className={`text-sm font-bold ${marginColor(p.macMargin)}`}>
                      {p.macMargin != null ? `${p.macMargin.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                  {p.costVariation != null && p.costVariation >= 5 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      p.costVariation >= 15 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      +{p.costVariation.toFixed(0)}%
                    </span>
                  )}
                  <ChevronDown size={14} className={`text-stone-300 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-stone-100 bg-stone-50">
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      <div className="bg-white rounded-lg p-3 border border-stone-200">
                        <p className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">Costo MAC</p>
                        <p className="text-sm font-bold text-stone-700">{formatREF(p.macCost)}</p>
                        <p className="text-[10px] text-stone-400 mt-1">
                          Margen: {p.macMargin != null ? `${p.macMargin.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-stone-200">
                        <p className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">Costo reemplazo</p>
                        <p className="text-sm font-bold text-stone-700">{formatREF(p.replacementCost)}</p>
                        <p className="text-[10px] text-stone-400 mt-1">
                          Margen: {p.replMargin != null ? `${p.replMargin.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                    </div>

                    {p.recipe && p.recipe.breakdown.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Composicion</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-stone-400 text-[10px] uppercase">
                              <th className="text-left py-1 font-medium">Ingrediente</th>
                              <th className="text-right py-1 font-medium">Qty</th>
                              <th className="text-right py-1 font-medium">MAC</th>
                              <th className="text-right py-1 font-medium">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.recipe.breakdown.map((b, i) => (
                              <tr key={i} className="border-t border-stone-200">
                                <td className="py-1 text-stone-700">{b.name}</td>
                                <td className="py-1 text-right text-stone-500">{b.qty}{b.unit ? ` ${b.unit}` : ""}</td>
                                <td className="py-1 text-right text-stone-500">{formatREF(b.ingCost)}</td>
                                <td className="py-1 text-right font-semibold text-stone-700">{formatREF(b.cost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MATERIA PRIMA LISTA
// ═══════════════════════════════════════════════════════
function MateriaLista({ items, priceHistoryByProduct, replacementCostByProduct, variationByProduct }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("variation_desc");
  const [expanded, setExpanded] = useState(null);

  const sorted = useMemo(() => {
    const list = items
      .filter((p) => !search || (p.name || "").toLowerCase().includes(search.toLowerCase()))
      .map((p) => ({ ...p, variation: variationByProduct[p.id] }));
    const cmp = (a, b) => {
      switch (sortKey) {
        case "variation_desc": return (b.variation || 0) - (a.variation || 0);
        case "variation_asc": return (a.variation || 0) - (b.variation || 0);
        case "cost_desc": return Number(b.cost_ref || 0) - Number(a.cost_ref || 0);
        case "name_asc": return (a.name || "").localeCompare(b.name || "");
        default: return 0;
      }
    };
    return list.sort(cmp);
  }, [items, search, sortKey, variationByProduct]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ingrediente..."
            className="w-full border border-stone-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none bg-white"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:border-brand focus:outline-none"
        >
          <option value="variation_desc">Mayor variacion (subiendo)</option>
          <option value="variation_asc">Menor variacion (bajando)</option>
          <option value="cost_desc">Mayor costo</option>
          <option value="name_asc">Alfabetico</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
              <th className="text-left px-3 py-2 font-medium">Ingrediente</th>
              <th className="text-right px-3 py-2 font-medium">Stock</th>
              <th className="text-right px-3 py-2 font-medium">MAC</th>
              <th className="text-center px-3 py-2 font-medium hidden md:table-cell">Tendencia 90d</th>
              <th className="text-right px-3 py-2 font-medium hidden md:table-cell">Ultimo</th>
              <th className="text-right px-3 py-2 font-medium">Var.</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const hist = priceHistoryByProduct[p.id] || [];
              const replacement = replacementCostByProduct[p.id];
              const isOpen = expanded === p.id;
              // sparkline: precios ordenados cronologicamente
              const sparkPoints = [...hist].reverse().map((h) => h.cost);
              return (
                <Fragment key={p.id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="border-t border-stone-100 cursor-pointer hover:bg-stone-50"
                  >
                    <td className="px-3 py-2 font-medium text-stone-800">{p.name}</td>
                    <td className="px-3 py-2 text-right text-stone-500">{Number(p.stock_quantity || 0)}</td>
                    <td className="px-3 py-2 text-right font-bold text-stone-700">{formatREF(Number(p.cost_ref || 0))}</td>
                    <td className="px-3 py-2 text-center hidden md:table-cell">
                      <Sparkline points={sparkPoints} />
                    </td>
                    <td className="px-3 py-2 text-right text-stone-500 hidden md:table-cell">{replacement != null ? formatREF(replacement) : "—"}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${variationColor(p.variation)}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {variationIcon(p.variation)}
                        {p.variation != null ? `${p.variation > 0 ? "+" : ""}${p.variation.toFixed(1)}%` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ChevronDown size={12} className={`text-stone-300 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="bg-stone-50 px-3 py-3 border-t border-stone-200">
                        <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Historial de compras (90d)</p>
                        {hist.length === 0 ? (
                          <p className="text-xs text-stone-400">Sin compras en este periodo.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-stone-400 text-[10px]">
                                <th className="text-left py-1 font-medium">Fecha</th>
                                <th className="text-right py-1 font-medium">Cantidad</th>
                                <th className="text-right py-1 font-medium">Costo/u</th>
                                <th className="text-left py-1 font-medium pl-3 hidden md:table-cell">Nota</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hist.map((h, i) => (
                                <tr key={i} className="border-t border-stone-200">
                                  <td className="py-1 text-stone-600">{new Date(h.date).toLocaleDateString("es-VE", { timeZone: "America/Caracas" })}</td>
                                  <td className="py-1 text-right text-stone-500">{h.qty}</td>
                                  <td className="py-1 text-right font-semibold text-stone-700">{formatREF(h.cost)}</td>
                                  <td className="py-1 text-stone-400 text-[11px] pl-3 hidden md:table-cell">{h.note}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-stone-400 text-xs">No hay ingredientes.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PROVEEDOR LISTA
// ═══════════════════════════════════════════════════════
function ProveedorLista({ supplierData }) {
  const [expanded, setExpanded] = useState(null);

  if (supplierData.length === 0) {
    return <p className="text-sm text-stone-400 text-center py-8">Sin compras en los ultimos 90 dias.</p>;
  }

  const total = supplierData.reduce((s, [, d]) => s + d.total, 0);

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-700 flex items-center gap-2">
          <Truck size={16} className="text-stone-500" /> Compras por proveedor — 90d
        </h3>
        <span className="text-xs text-stone-500">
          Total: <span className="font-bold text-brand">{formatREF(total)}</span>
        </span>
      </div>
      <div className="divide-y divide-stone-100">
        {supplierData.map(([supplier, data]) => {
          const isOpen = expanded === supplier;
          const pct = total > 0 ? (data.total / total) * 100 : 0;
          const topItems = Object.entries(data.items)
            .sort((a, b) => b[1].totalCost - a[1].totalCost)
            .slice(0, 5);

          return (
            <div key={supplier}>
              <button
                onClick={() => setExpanded(isOpen ? null : supplier)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-stone-50 transition-colors"
              >
                <Package2 size={16} className="text-stone-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800">{supplier}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 max-w-[200px] bg-stone-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-stone-400">{pct.toFixed(1)}% · {data.count} compra{data.count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-brand">{formatREF(data.total)}</p>
                </div>
                <ChevronDown size={14} className={`text-stone-300 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 bg-stone-50 border-t border-stone-100">
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 my-2">Top items comprados</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-stone-400 text-[10px] uppercase">
                        <th className="text-left py-1 font-medium">Item</th>
                        <th className="text-right py-1 font-medium">Cantidad</th>
                        <th className="text-right py-1 font-medium hidden md:table-cell">Compras</th>
                        <th className="text-right py-1 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map(([name, info]) => (
                        <tr key={name} className="border-t border-stone-200">
                          <td className="py-1.5 text-stone-700">{name}</td>
                          <td className="py-1.5 text-right text-stone-500">{info.qty}</td>
                          <td className="py-1.5 text-right text-stone-400 hidden md:table-cell">{info.count}x</td>
                          <td className="py-1.5 text-right font-semibold text-stone-700">{formatREF(info.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// EVOLUCION MAC — line chart multi-producto mes a mes
// ═══════════════════════════════════════════════════════
function EvolucionMAC({ movementsYear, materiaPrima }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");

  // Indexar movimientos por producto (ya ordenados ASC por created_at en load)
  const movementsByProduct = useMemo(() => {
    const map = {};
    movementsYear.forEach((m) => {
      if (!m.product_id) return;
      if (!map[m.product_id]) map[m.product_id] = [];
      map[m.product_id].push(m);
    });
    return map;
  }, [movementsYear]);

  // Productos elegibles: solo los que tienen >=2 restocks en 12m
  const eligibles = useMemo(() => {
    return materiaPrima
      .map((p) => ({ ...p, restockCount: (movementsByProduct[p.id] || []).length }))
      .filter((p) => p.restockCount >= 2)
      .sort((a, b) => b.restockCount - a.restockCount);
  }, [materiaPrima, movementsByProduct]);

  // Default: top 3 por # restocks
  useEffect(() => {
    if (selectedIds.length === 0 && eligibles.length > 0) {
      setSelectedIds(eligibles.slice(0, 3).map((p) => p.id));
    }
  }, [eligibles, selectedIds.length]);

  // Generar las labels de meses (12 ultimos, formato "Ene 26")
  const monthLabels = useMemo(() => {
    const labels = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleDateString("es-VE", { month: "short", timeZone: "America/Caracas" });
      const yr = String(d.getFullYear()).slice(-2);
      labels.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1).replace(".", "")} ${yr}`,
        endOfMonth: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
      });
    }
    return labels;
  }, []);

  // Calcular MAC al final de cada mes para cada producto seleccionado
  // Replay restock movements en orden ASC, computar MAC incremental, tomar valor al cierre del mes
  const macHistoryByProduct = useMemo(() => {
    const map = {};
    selectedIds.forEach((pid) => {
      const mvts = movementsByProduct[pid] || [];
      let stock = 0;
      let mac = 0;
      const monthlyMAC = {};
      const sorted = [...mvts].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      let cursor = 0;
      monthLabels.forEach(({ key, endOfMonth }) => {
        while (cursor < sorted.length && new Date(sorted[cursor].created_at) <= endOfMonth) {
          const m = sorted[cursor];
          const qty = Number(m.quantity || 0);
          const cost = Number(m.cost_ref || 0);
          if (qty > 0 && cost >= 0) {
            const newStock = stock + qty;
            mac = newStock > 0 ? (stock * mac + qty * cost) / newStock : cost;
            stock = newStock;
          }
          cursor++;
        }
        // Si no hubo movimientos antes de este mes, MAC es null (no data)
        monthlyMAC[key] = stock > 0 ? mac : null;
      });
      map[pid] = monthlyMAC;
    });
    return map;
  }, [selectedIds, movementsByProduct, monthLabels]);

  // Chart data
  const chartData = useMemo(() => {
    const datasets = selectedIds.map((pid, i) => {
      const product = materiaPrima.find((p) => p.id === pid);
      const history = macHistoryByProduct[pid] || {};
      const color = LINE_COLORS[i % LINE_COLORS.length];
      return {
        label: product?.name || pid,
        data: monthLabels.map((m) => history[m.key]),
        borderColor: color,
        backgroundColor: color + "20",
        tension: 0.35,
        spanGaps: true,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
      };
    });
    return {
      labels: monthLabels.map((m) => m.label),
      datasets,
    };
  }, [selectedIds, macHistoryByProduct, monthLabels, materiaPrima]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 10, font: { size: 11 }, padding: 12 },
      },
      tooltip: {
        callbacks: {
          label: (c) => `${c.dataset.label}: ${c.raw != null ? `REF ${Number(c.raw).toFixed(4)}` : "sin data"}`,
        },
      },
    },
    scales: {
      x: { grid: { color: "#f5f5f4" }, ticks: { font: { size: 10 } } },
      y: {
        beginAtZero: false,
        grid: { color: "#f5f5f4" },
        ticks: { font: { size: 10 }, callback: (v) => `REF ${v}` },
      },
    },
  };

  const toggleProduct = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const filteredEligibles = eligibles.filter(
    (p) => !search || (p.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-stone-700">
            Evolucion MAC mes a mes — 12 meses
          </h3>
          <span className="text-[11px] text-stone-400">
            {selectedIds.length} producto{selectedIds.length !== 1 ? "s" : ""} seleccionado{selectedIds.length !== 1 ? "s" : ""}
          </span>
        </div>

        {selectedIds.length === 0 ? (
          <p className="text-xs text-stone-400 text-center py-12">
            Selecciona productos abajo para ver su evolucion.
          </p>
        ) : (
          <div style={{ height: 340 }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600">
            Productos disponibles
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="text-[11px] text-stone-500 hover:text-stone-700 underline"
            >
              Limpiar
            </button>
            <button
              onClick={() => setSelectedIds(eligibles.slice(0, 5).map((p) => p.id))}
              className="text-[11px] text-brand hover:underline"
            >
              Top 5
            </button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full border border-stone-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:border-brand focus:outline-none bg-white"
          />
        </div>

        {filteredEligibles.length === 0 ? (
          <p className="text-xs text-stone-400 text-center py-4">
            Sin productos con suficiente historia (necesitan {">"}=2 compras en 12m).
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filteredEligibles.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              const colorIdx = selectedIds.indexOf(p.id);
              const color = isSelected ? LINE_COLORS[colorIdx % LINE_COLORS.length] : null;
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProduct(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 ${
                    isSelected
                      ? "border-transparent text-white"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                  }`}
                  style={isSelected ? { backgroundColor: color } : {}}
                >
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                  {p.name}
                  <span className={`text-[10px] ${isSelected ? "opacity-80" : "text-stone-400"}`}>
                    {p.restockCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
