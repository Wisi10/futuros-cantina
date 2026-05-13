"use client";
import { useState, useEffect, useCallback } from "react";
import { DollarSign, Hash, CreditCard, Banknote, ChevronDown, Download, Gift, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBs, formatUSD, calcUSD, METHOD_LABELS, NON_CASH_METHODS } from "@/lib/utils";
import ClientLink from "@/components/shared/ClientLink";
import * as XLSX from "xlsx";

const METHOD_ICONS = {
  pago_movil: "📱",
  cash_bs: "💵",
  cash_usd: "💲",
  zelle: "🏦",
  credit: "📋",
  cortesia: "🎁",
  cripto: "🪙",
};

export default function CajaView({ user, rate }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSale, setExpandedSale] = useState(null);

  const isToday = selectedDate === new Date().toISOString().split("T")[0];
  const isAdmin = user?.role === "admin";

  const [salePayments, setSalePayments] = useState([]); // sprint 7B
  const [productStock, setProductStock] = useState({}); // {productId: {name, stock, has_recipe}}
  const [recipes, setRecipes] = useState({}); // {productId: [{ingredient_id, quantity, unit, ingredient_name}]}
  const [showInventoryCheck, setShowInventoryCheck] = useState(false);

  const loadSales = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("cantina_sales")
      .select("*")
      .eq("sale_date", selectedDate)
      .is("voided_at", null)
      .order("created_at", { ascending: false });
    setSales(data || []);

    const ids = (data || []).map((s) => s.id);
    if (ids.length > 0) {
      const { data: sp } = await supabase
        .from("cantina_sale_payments")
        .select("sale_id, payment_method, amount_ref, is_change")
        .in("sale_id", ids);
      setSalePayments(sp || []);
    } else {
      setSalePayments([]);
    }

    // Para soft inventory check: cargar stock actual + recetas de productos vendidos
    const soldProductIds = new Set();
    (data || []).forEach((s) => (s.items || []).forEach((it) => { if (it.product_id) soldProductIds.add(it.product_id); }));
    if (soldProductIds.size > 0) {
      const idList = Array.from(soldProductIds);
      const [prodRes, recRes] = await Promise.all([
        supabase.from("products").select("id, name, stock_quantity, has_recipe").in("id", idList),
        supabase.from("product_recipes").select("product_id, ingredient_id, quantity, unit").in("product_id", idList),
      ]);
      const stockMap = {};
      (prodRes.data || []).forEach((p) => { stockMap[p.id] = p; });
      setProductStock(stockMap);

      // Cargar nombres de ingredientes si hay recetas
      const recipeMap = {};
      const ingredientIds = new Set();
      (recRes.data || []).forEach((r) => {
        if (!recipeMap[r.product_id]) recipeMap[r.product_id] = [];
        recipeMap[r.product_id].push(r);
        if (r.ingredient_id) ingredientIds.add(r.ingredient_id);
      });
      if (ingredientIds.size > 0) {
        const { data: ings } = await supabase.from("products").select("id, name, stock_quantity").in("id", Array.from(ingredientIds));
        const ingMap = {};
        (ings || []).forEach((i) => { ingMap[i.id] = i; });
        Object.keys(recipeMap).forEach((pid) => {
          recipeMap[pid] = recipeMap[pid].map((r) => ({ ...r, ingredient_name: ingMap[r.ingredient_id]?.name, ingredient_stock: ingMap[r.ingredient_id]?.stock_quantity }));
        });
      }
      setRecipes(recipeMap);
    } else {
      setProductStock({}); setRecipes({});
    }

    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  // KPI calculations
  const totalRef = sales.reduce((sum, s) => sum + parseFloat(s.total_ref || 0), 0);
  const totalCount = sales.length;
  const creditSales = sales.filter((s) => s.payment_status === "credit");
  const creditTotal = creditSales.reduce((sum, s) => sum + parseFloat(s.total_ref || 0), 0);
  // Cortesias: sales with non-cash methods (cortesia) — NOT counted as cash collected
  const cortesiaTotal = sales
    .filter((s) => NON_CASH_METHODS.includes(s.payment_method))
    .reduce((sum, s) => sum + parseFloat(s.total_ref || 0), 0);
  const paidTotal = totalRef - creditTotal - cortesiaTotal;

  // Payment method breakdown — read from cantina_sale_payments (sprint 7B)
  const methodBreakdown = {};
  // Credits as their own bucket
  if (creditSales.length > 0) {
    methodBreakdown["credit"] = { count: creditSales.length, total: creditTotal };
  }
  // Aggregate sale_payments by method (sums positive ingresos and negative changes)
  for (const p of salePayments) {
    const m = p.payment_method || "otro";
    if (!methodBreakdown[m]) methodBreakdown[m] = { count: 0, total: 0 };
    methodBreakdown[m].total += parseFloat(p.amount_ref || 0);
    // Count only non-change payments to avoid inflating txn count
    if (!p.is_change) methodBreakdown[m].count += 1;
  }

  // Flujo de dinero — desglosado por entradas vs vueltos, separando cash de digital
  const cashMethods = new Set(["cash_bs", "cash_usd"]);
  const flujo = {
    entradaTotal: 0,   // todos los pagos positivos (suma ingresos)
    vueltoTotal: 0,    // todos los pagos negativos (suma vueltos)
    cashBsEntrada: 0, cashBsVuelto: 0,
    cashUsdEntrada: 0, cashUsdVuelto: 0,
    digitalTotal: 0,   // pago_movil + zelle + cripto
  };
  for (const p of salePayments) {
    const amt = parseFloat(p.amount_ref || 0);
    const m = p.payment_method || "";
    if (p.is_change || amt < 0) {
      flujo.vueltoTotal += Math.abs(amt);
      if (m === "cash_bs") flujo.cashBsVuelto += Math.abs(amt);
      else if (m === "cash_usd") flujo.cashUsdVuelto += Math.abs(amt);
    } else {
      flujo.entradaTotal += amt;
      if (m === "cash_bs") flujo.cashBsEntrada += amt;
      else if (m === "cash_usd") flujo.cashUsdEntrada += amt;
      else if (!cashMethods.has(m) && m !== "cortesia") flujo.digitalTotal += amt;
    }
  }
  const cashBsNeto = flujo.cashBsEntrada - flujo.cashBsVuelto;
  const cashUsdNeto = flujo.cashUsdEntrada - flujo.cashUsdVuelto;
  const cajaNeta = flujo.entradaTotal - flujo.vueltoTotal;

  const exportExcel = () => {
    const rows = sales.map((s) => ({
      Hora: new Date(s.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
      Items: (s.items || []).map((i) => `${i.name} x${i.qty}`).join(", "),
      "Total REF": parseFloat(s.total_ref || 0).toFixed(2),
      "Total Bs": s.total_bs ? parseFloat(s.total_bs).toFixed(2) : "—",
      Metodo: s.payment_status === "credit" ? "Credito" : (METHOD_LABELS[s.payment_method] || s.payment_method || "—"),
      Estado: s.payment_status === "credit" ? "Credito" : "Pagado",
      Cliente: s.client_name || "—",
      Operador: s.created_by || "—",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, `caja-${selectedDate}.xlsx`);
  };

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-800">
          {isToday ? "Caja del dia" : `Caja — ${selectedDate}`}
        </h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs border border-stone-200 rounded-lg px-2 py-1.5 text-stone-600"
              />
              <button
                onClick={exportExcel}
                disabled={sales.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand-dark disabled:opacity-30 transition-colors"
              >
                <Download size={14} /> Exportar
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm animate-pulse">Cargando...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KPICard
              icon={<DollarSign size={20} />}
              label="Total ventas"
              value={`REF ${totalRef.toFixed(2)}`}
              sub={rate ? formatBs(totalRef, rate.eur) : null}
              color="text-brand"
            />
            <KPICard
              icon={<Hash size={20} />}
              label="# de ventas"
              value={totalCount}
              sub="ventas"
              color="text-stone-700"
            />
            <KPICard
              icon={<CreditCard size={20} />}
              label="Creditos"
              value={`REF ${creditTotal.toFixed(2)}`}
              sub="pendientes"
              color="text-amber-600"
            />
            <KPICard
              icon={<Banknote size={20} />}
              label="Cobrado"
              value={`REF ${paidTotal.toFixed(2)}`}
              sub="excluye cortesias"
              color="text-green-600"
            />
            <KPICard
              icon={<Gift size={20} />}
              label="Cortesias"
              value={`REF ${cortesiaTotal.toFixed(2)}`}
              sub="no afecta caja"
              color="text-gold"
            />
          </div>

          {/* Flujo de caja — entradas, vueltos, neto por moneda */}
          {salePayments.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h3 className="text-sm font-bold text-stone-700 flex items-center gap-2">
                  <Wallet size={16} /> Flujo de caja
                </h3>
                <p className="text-[11px] text-stone-400 mt-0.5">Entradas, vueltos entregados y neto del día.</p>
              </div>

              <div className="p-4 space-y-4">
                {/* Resumen general */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <TrendingUp size={14} className="text-green-600" />
                      <span className="text-[10px] uppercase tracking-wider text-green-700 font-bold">Entró</span>
                    </div>
                    <p className="text-base md:text-lg font-bold text-green-700">REF {flujo.entradaTotal.toFixed(2)}</p>
                    {rate && <p className="text-[10px] text-stone-500">{formatBs(flujo.entradaTotal, rate.eur)}</p>}
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <TrendingDown size={14} className="text-red-600" />
                      <span className="text-[10px] uppercase tracking-wider text-red-700 font-bold">Vuelto</span>
                    </div>
                    <p className="text-base md:text-lg font-bold text-red-700">REF {flujo.vueltoTotal.toFixed(2)}</p>
                    {rate && <p className="text-[10px] text-stone-500">{formatBs(flujo.vueltoTotal, rate.eur)}</p>}
                  </div>
                  <div className="bg-brand/5 border border-brand/20 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Wallet size={14} className="text-brand" />
                      <span className="text-[10px] uppercase tracking-wider text-brand font-bold">Neto</span>
                    </div>
                    <p className="text-base md:text-lg font-bold text-brand">REF {cajaNeta.toFixed(2)}</p>
                    {rate && <p className="text-[10px] text-stone-500">{formatUSD(cajaNeta, rate)} · {formatBs(cajaNeta, rate.eur)}</p>}
                  </div>
                </div>

                {/* Desglose cash en gaveta */}
                {(flujo.cashBsEntrada + flujo.cashBsVuelto + flujo.cashUsdEntrada + flujo.cashUsdVuelto) > 0 && (
                  <div className="border border-stone-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-stone-50 border-b border-stone-200">
                      <p className="text-[11px] uppercase tracking-wider font-bold text-stone-600">Cash en gaveta (efectivo neto)</p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-stone-400 uppercase">
                          <th className="text-left px-3 py-1.5 font-medium">Moneda</th>
                          <th className="text-right px-3 py-1.5 font-medium">Entró</th>
                          <th className="text-right px-3 py-1.5 font-medium">Vuelto</th>
                          <th className="text-right px-3 py-1.5 font-medium">Neto (REF)</th>
                          <th className="text-right px-3 py-1.5 font-medium">Neto (real)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-stone-100">
                          <td className="px-3 py-2 font-medium text-stone-700">💵 Cash Bs</td>
                          <td className="px-3 py-2 text-right text-green-700">+{flujo.cashBsEntrada.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-red-600">-{flujo.cashBsVuelto.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold text-brand">{cashBsNeto.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold text-stone-700">
                            {rate ? formatBs(cashBsNeto, rate.eur) : "—"}
                          </td>
                        </tr>
                        <tr className="border-t border-stone-100">
                          <td className="px-3 py-2 font-medium text-stone-700">💲 Cash USD</td>
                          <td className="px-3 py-2 text-right text-green-700">+{flujo.cashUsdEntrada.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-red-600">-{flujo.cashUsdVuelto.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold text-brand">{cashUsdNeto.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold text-stone-700">
                            {rate ? formatUSD(cashUsdNeto, rate) : "—"}
                          </td>
                        </tr>
                        {flujo.digitalTotal > 0 && (
                          <tr className="border-t border-stone-100 bg-stone-50/50">
                            <td className="px-3 py-2 font-medium text-stone-700">📱 Digital (Pago Móvil / Zelle / Cripto)</td>
                            <td className="px-3 py-2 text-right text-green-700">+{flujo.digitalTotal.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-stone-400">—</td>
                            <td className="px-3 py-2 text-right font-bold text-brand">{flujo.digitalTotal.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-stone-400 text-[10px]">no toca gaveta</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment method breakdown */}
          {Object.keys(methodBreakdown).length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <h3 className="text-sm font-bold text-stone-700">Desglose por metodo de pago</h3>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="text-xs text-stone-400 border-b border-stone-100">
                    <th className="text-left px-4 py-2 font-medium">Metodo</th>
                    <th className="text-center px-4 py-2 font-medium"># ventas</th>
                    <th className="text-right px-4 py-2 font-medium">Total REF</th>
                    <th className="text-right px-4 py-2 font-medium">Total Bs</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(methodBreakdown)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([method, data]) => (
                      <tr key={method} className="border-b border-stone-50 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-stone-700">
                          {METHOD_ICONS[method] || "💳"} {METHOD_LABELS[method] || method}
                        </td>
                        <td className="px-4 py-2.5 text-center text-stone-500">{data.count}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-brand">
                          REF {data.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-stone-400 text-xs">
                          {method === "credit" ? "—" : rate ? formatBs(data.total, rate.eur) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Soft inventory check */}
          {(() => {
            // Aggregate items sold today (direct products only, not ingredients)
            const soldDirect = {}; // {productId: {name, qty, hasRecipe}}
            const soldIngredients = {}; // {ingredientId: {name, qty, currentStock}}
            sales.forEach((s) => {
              (s.items || []).forEach((it) => {
                const pid = it.product_id;
                if (!pid) return;
                const product = productStock[pid];
                const hasRecipe = product?.has_recipe;
                if (!soldDirect[pid]) {
                  soldDirect[pid] = {
                    name: it.name || product?.name || "(?)",
                    qty: 0,
                    hasRecipe,
                    currentStock: product?.stock_quantity ?? null,
                  };
                }
                soldDirect[pid].qty += Number(it.qty || 0);
                // Si tiene receta, agregar consumo de ingredientes
                if (hasRecipe && recipes[pid]) {
                  recipes[pid].forEach((r) => {
                    const ingId = r.ingredient_id;
                    if (!ingId) return;
                    const needed = Number(r.quantity || 0) * Number(it.qty || 0);
                    if (!soldIngredients[ingId]) {
                      soldIngredients[ingId] = {
                        name: r.ingredient_name || "(?)",
                        qty: 0,
                        unit: r.unit || "",
                        currentStock: r.ingredient_stock ?? null,
                      };
                    }
                    soldIngredients[ingId].qty += needed;
                  });
                }
              });
            });

            const directList = Object.values(soldDirect).filter((x) => !x.hasRecipe).sort((a, b) => b.qty - a.qty);
            const recipeList = Object.values(soldDirect).filter((x) => x.hasRecipe).sort((a, b) => b.qty - a.qty);
            const ingredientList = Object.values(soldIngredients).sort((a, b) => b.qty - a.qty);

            if (directList.length === 0 && recipeList.length === 0) return null;

            return (
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                <button
                  onClick={() => setShowInventoryCheck(!showInventoryCheck)}
                  className="w-full px-4 py-3 border-b border-stone-100 flex items-center justify-between hover:bg-stone-50 transition-colors"
                >
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-stone-700">Chequeo de inventario</h3>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      {directList.length + recipeList.length} producto{(directList.length + recipeList.length) !== 1 ? "s" : ""} vendido{(directList.length + recipeList.length) !== 1 ? "s" : ""}
                      {ingredientList.length > 0 ? ` · ${ingredientList.length} ingrediente${ingredientList.length !== 1 ? "s" : ""} consumido${ingredientList.length !== 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-stone-400">{showInventoryCheck ? "Ocultar" : "Mostrar"}</span>
                </button>

                {showInventoryCheck && (
                  <div className="p-4 space-y-4 bg-stone-50/50">
                    <p className="text-[11px] text-stone-500 italic">
                      Cross-check rapido vs inventario fisico al cierre del dia. "Stock inicial" estimado = stock actual + vendido hoy.
                    </p>

                    {directList.length > 0 && (
                      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
                        <p className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-stone-500 bg-stone-50 border-b border-stone-200">Productos directos</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-stone-400 text-[10px] uppercase">
                              <th className="text-left px-3 py-1.5 font-medium">Producto</th>
                              <th className="text-right px-3 py-1.5 font-medium">Vendido</th>
                              <th className="text-right px-3 py-1.5 font-medium">Stock inicial</th>
                              <th className="text-right px-3 py-1.5 font-medium">Stock actual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {directList.map((p, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-3 py-1.5 text-stone-700">{p.name}</td>
                                <td className="px-3 py-1.5 text-right font-bold text-brand">{p.qty}</td>
                                <td className="px-3 py-1.5 text-right text-stone-500">{p.currentStock != null ? p.currentStock + p.qty : "—"}</td>
                                <td className="px-3 py-1.5 text-right font-medium text-stone-700">{p.currentStock != null ? p.currentStock : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {ingredientList.length > 0 && (
                      <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
                        <p className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-stone-500 bg-stone-50 border-b border-stone-200">Ingredientes consumidos (via recetas)</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-stone-400 text-[10px] uppercase">
                              <th className="text-left px-3 py-1.5 font-medium">Ingrediente</th>
                              <th className="text-right px-3 py-1.5 font-medium">Consumido</th>
                              <th className="text-right px-3 py-1.5 font-medium">Stock actual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ingredientList.map((ing, i) => (
                              <tr key={i} className="border-t border-stone-100">
                                <td className="px-3 py-1.5 text-stone-700">{ing.name}</td>
                                <td className="px-3 py-1.5 text-right font-bold text-brand">
                                  {Math.round(ing.qty * 100) / 100}{ing.unit ? ` ${ing.unit}` : ""}
                                </td>
                                <td className="px-3 py-1.5 text-right text-stone-500">{ing.currentStock != null ? ing.currentStock : "—"}</td>
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
          })()}

          {/* Recent sales */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-700">
                {isToday ? "Ventas de hoy" : "Ventas del dia"} ({sales.length})
              </h3>
            </div>

            {sales.length === 0 ? (
              <div className="text-center py-8 text-stone-400 text-xs">
                No hay ventas registradas
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {sales.map((sale) => {
                  const items = sale.items || [];
                  const time = new Date(sale.created_at).toLocaleTimeString("es-VE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const isCredit = sale.payment_status === "credit";
                  const method = isCredit ? "Credito" : (METHOD_LABELS[sale.payment_method] || sale.payment_method || "—");
                  const icon = isCredit ? "📋" : (METHOD_ICONS[sale.payment_method] || "💳");
                  const expanded = expandedSale === sale.id;

                  return (
                    <div key={sale.id}>
                      <button
                        onClick={() => setExpandedSale(expanded ? null : sale.id)}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-stone-50 transition-colors"
                      >
                        <span className="text-xs text-stone-400 w-12 shrink-0">{time}</span>
                        <span className="text-xs text-stone-600 flex-1 truncate">
                          {items.map((i) => `${i.name} x${i.qty}`).join(", ")}
                          {sale.client_name && (
                            <ClientLink clientId={sale.client_id} name={sale.client_name} className="ml-1 !text-stone-500" muted />
                          )}
                        </span>
                        <span className="text-xs font-bold text-brand whitespace-nowrap">
                          REF {parseFloat(sale.total_ref).toFixed(2)}
                        </span>
                        <span className="text-xs text-stone-400 w-20 text-right truncate">
                          {icon} {method}
                        </span>
                        <ChevronDown
                          size={14}
                          className={`text-stone-300 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
                        />
                      </button>

                      {expanded && (
                        <div className="px-4 pb-3 pt-1 bg-stone-50 text-xs space-y-1">
                          {items.map((item, i) => (
                            <div key={i} className="flex justify-between text-stone-500">
                              <span>{item.name} x{item.qty}</span>
                              <span>REF {(item.price_ref * item.qty).toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-1 border-t border-stone-200 font-semibold text-stone-700">
                            <span>Total</span>
                            <span>REF {parseFloat(sale.total_ref).toFixed(2)}</span>
                          </div>
                          {sale.client_name && (
                            <div className="text-stone-400">Cliente: {sale.client_name}</div>
                          )}
                          {sale.created_by && (
                            <div className="text-stone-400">Operador: {sale.created_by}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KPICard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="text-stone-400">{icon}</div>
        <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">{label}</span>
      </div>
      <p className={`text-base font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-stone-400 mt-0.5">{sub}</p>}
    </div>
  );
}
