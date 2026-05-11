"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, CreditCard, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calcBs, ProductImage } from "@/lib/utils";
import SideNav from "@/components/nav/SideNav";
import RateChip from "@/components/shared/RateChip";
import GlobalClientSearch from "@/components/shared/GlobalClientSearch";
import ClientProfileModal from "@/components/clientes/ClientProfileModal";
import { ClientProfileProvider, useClientProfile } from "@/lib/clientProfileContext";
import ProductGrid from "@/components/vender/ProductGrid";
import CartSidebar from "@/components/vender/CartSidebar";
import PaymentModal from "@/components/vender/PaymentModal";
import SuccessScreen from "@/components/vender/SuccessScreen";
import CreditsModal from "@/components/vender/CreditsModal";
import ConfigView from "@/components/config/ConfigView";
import InventarioView from "@/components/inventario/InventarioView";
import CajaView from "@/components/caja/CajaView";
import ReportesView from "@/components/reportes/ReportesView";
import ShiftPill from "@/components/shifts/ShiftPill";
import ClientModal from "@/components/client/ClientModal";
import OpenShiftModal from "@/components/shifts/OpenShiftModal";
import CloseShiftModal from "@/components/shifts/CloseShiftModal";
import ShiftsView from "@/components/shifts/ShiftsView";
import PuntosView from "@/components/puntos/PuntosView";
import ClientesView from "@/components/clientes/ClientesView";
import EventosView from "@/components/eventos/EventosView";
import StockAlertToast from "@/components/vender/StockAlertToast";
import DashboardView from "@/components/dashboard/DashboardView";
import { ChevronDown as ChevDown } from "lucide-react";
import { loadLowStockThreshold, isLowStock } from "@/lib/stockHelpers";

function GlobalProfileMount({ user, rate }) {
  const { profileId, close } = useClientProfile();
  if (!profileId) return null;
  return <ClientProfileModal clientId={profileId} user={user} onClose={close} />;
}

export default function POSPage() {
  return (
    <ClientProfileProvider>
      <POSPageInner />
    </ClientProfileProvider>
  );
}

function POSPageInner() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("vender");

  // Vender state
  const [screen, setScreen] = useState("pos");
  const [products, setProducts] = useState([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [showStockToast, setShowStockToast] = useState(false);
  const [liveExpanded, setLiveExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 768;
  });
  const [cart, setCart] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("cantina_cart");
        return saved ? JSON.parse(saved) : [];
      } catch { return []; }
    }
    return [];
  });
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [todayStats, setTodayStats] = useState({ total: 0, count: 0 });

  // Void sale state
  const [lastSaleRecord, setLastSaleRecord] = useState(null); // full DB record for void
  const [lastSaleTime, setLastSaleTime] = useState(null); // timestamp for 5-min window
  const [voidingState, setVoidingState] = useState(false); // "voiding" | false

  // Confirmation dialog
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null); // {method, ref} or {credit data}

  // Persist cart to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("cantina_cart", JSON.stringify(cart));
  }, [cart]);

  // Credits state
  const [showCredits, setShowCredits] = useState(false);
  const [pendingCreditsCount, setPendingCreditsCount] = useState(0);

  // Shift state
  const [activeShift, setActiveShift] = useState(null);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [saleClient, setSaleClient] = useState(null); // {id, name, points}

  // Auth check
  useEffect(() => {
    const stored = sessionStorage.getItem("cantina_user");
    if (!stored) { router.push("/"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  // Data loading
  const loadProducts = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_cantina", true)
      .eq("active", true)
      .order("sort_order");
    if (data) setProducts(data);
    setLoading(false);
  }, []);

  const loadRate = useCallback(async () => {
    if (!supabase) return;
    // Try today first (local date, not UTC)
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const { data: todayRates } = await supabase
      .from("exchange_rates")
      .select("*")
      .gte("created_at", localToday + "T00:00:00")
      .order("created_at", { ascending: false })
      .limit(1);

    if (todayRates?.length) {
      setRate({
        id: todayRates[0].id,
        eur: parseFloat(todayRates[0].eur_rate),
        usd: parseFloat(todayRates[0].usd_rate),
        isOld: false,
      });
      return;
    }

    // Fallback: get latest rate regardless of date
    const { data: latestRates } = await supabase
      .from("exchange_rates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestRates?.length) {
      setRate({
        id: latestRates[0].id,
        eur: parseFloat(latestRates[0].eur_rate),
        usd: parseFloat(latestRates[0].usd_rate),
        isOld: true,
      });
    } else {
      setRate(null);
    }
  }, []);

  const loadTodayStats = useCallback(async () => {
    if (!supabase) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { data } = await supabase
      .from("cantina_sales")
      .select("total_ref, client_name, created_at")
      .eq("sale_date", today)
      .is("voided_at", null)
      .order("created_at", { ascending: false });
    if (data) {
      const withClient = data.find((s) => s.client_name);
      setTodayStats({
        total: data.reduce((sum, s) => sum + parseFloat(s.total_ref), 0),
        count: data.length,
        lastClient: withClient ? { name: withClient.client_name, at: withClient.created_at } : null,
      });
    }
  }, []);

  const loadPendingCreditsCount = useCallback(async () => {
    if (!supabase) return;
    const { count } = await supabase
      .from("cantina_credits")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "partial"]);
    setPendingCreditsCount(count || 0);
  }, []);

  const loadActiveShift = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("shifts")
      .select("*")
      .eq("status", "open")
      .limit(1)
      .single();
    setActiveShift(data || null);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadProducts();
    loadRate();
    loadTodayStats();
    loadPendingCreditsCount();
    loadActiveShift();
    loadLowStockThreshold(supabase).then(setLowStockThreshold);
  }, [user, loadProducts, loadRate, loadTodayStats, loadPendingCreditsCount, loadActiveShift]);

  // Show low-stock toast at most once per day (sessionStorage flag)
  useEffect(() => {
    if (!user || !products.length) return;
    if (typeof window === "undefined") return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
    const flag = `low_stock_dismissed_${today}`;
    if (sessionStorage.getItem(flag)) return;
    const lowItems = products.filter((p) => p.is_cantina && p.active && isLowStock(p, lowStockThreshold));
    if (lowItems.length > 0) setShowStockToast(true);
  }, [user, products, lowStockThreshold]);

  const lowStockItems = products.filter((p) => p.is_cantina && p.active && isLowStock(p, lowStockThreshold));

  const dismissStockToast = () => {
    setShowStockToast(false);
    if (typeof window !== "undefined") {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
      sessionStorage.setItem(`low_stock_dismissed_${today}`, "1");
    }
  };

  // Check void window (5 minutes)
  const canVoid = lastSaleRecord && lastSaleTime && (Date.now() - lastSaleTime < 5 * 60 * 1000);

  // Cart operations
  const addToCart = (product) => {
    const stock = Number(product.stock_quantity ?? 0);
    if (stock <= 0) {
      alert("Sin stock disponible");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.qty >= stock) {
          alert(`Solo quedan ${stock} unidades de ${product.name}`);
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const newQty = item.qty + delta;
          if (newQty <= 0) return null;
          if (newQty > (item.product.stock_quantity ?? 0)) return item;
          return { ...item, qty: newQty };
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (productId, kind = "regular") => {
    // kind: 'regular' | 'redemption'
    setCart((prev) => prev.filter((item) => {
      if (item.product.id !== productId) return true;
      if (kind === "redemption") return !item.isRedemption;
      // 'regular': remove only non-special variant (keep redemptions)
      return item.isRedemption;
    }));
  };

  const addRedemption = (product) => {
    // Add as free item — redemption only processed at confirm
    setCart((prev) => {
      if (prev.some(i => i.product.id === product.id && i.isRedemption)) return prev;
      return [...prev, { product: { ...product, price_ref: 0 }, qty: 1, isRedemption: true, redemptionProductId: product.id, redemptionCost: product.redemption_cost_points }];
    });
  };

  // Totals
  const totalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const totalBs = calcBs(totalRef, rate?.eur);

  // Local date string for sale_date
  const getLocalDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  // Shared sale logic
  const executeSale = async (saleData) => {
    const stockBearingItems = cart;

    // Pre-fetch recipe + ingredient stock for any has_recipe items
    const recipeItemIds = stockBearingItems
      .filter((i) => i.product.has_recipe)
      .map((i) => i.product.id);
    let recipesByProduct = {};
    let ingredientStockById = {};
    if (recipeItemIds.length > 0) {
      const { data: recRows } = await supabase
        .from("product_recipes")
        .select("product_id, ingredient_id, quantity, unit")
        .in("product_id", recipeItemIds);
      (recRows || []).forEach((r) => {
        if (!recipesByProduct[r.product_id]) recipesByProduct[r.product_id] = [];
        recipesByProduct[r.product_id].push(r);
      });
      const ingredientIds = [...new Set((recRows || []).map((r) => r.ingredient_id).filter(Boolean))];
      if (ingredientIds.length > 0) {
        const { data: ingRows } = await supabase
          .from("products")
          .select("id, name, stock_quantity, cost_ref")
          .in("id", ingredientIds);
        (ingRows || []).forEach((p) => { ingredientStockById[p.id] = p; });
      }
    }

    // Stock checks: for has_recipe items check ingredients; for plain items check own stock
    for (const item of stockBearingItems) {
      if (item.product.has_recipe) {
        const recipe = recipesByProduct[item.product.id] || [];
        if (recipe.length === 0) {
          alert(`${item.product.name} esta marcado con receta pero no tiene ingredientes.`);
          return null;
        }
        for (const ing of recipe) {
          const stock = ingredientStockById[ing.ingredient_id];
          if (!stock) continue;
          const needed = Number(ing.quantity) * item.qty;
          if (Number(stock.stock_quantity || 0) < needed) {
            const ok = window.confirm(
              `Falta materia prima para ${item.product.name}: ${stock.name} (necesita ${needed}, hay ${stock.stock_quantity}). Stock quedara negativo. Continuar?`
            );
            if (!ok) return null;
          }
        }
        continue;
      }
      const { data: current } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", item.product.id)
        .single();
      if (current && current.stock_quantity < item.qty) {
        alert(`Stock insuficiente para ${item.product.name}. Disponible: ${current.stock_quantity}`);
        return null;
      }
    }

    const items = cart.map((item) => ({
      product_id: item.product.id,
      name: item.product.name,
      qty: item.qty,
      price_ref: parseFloat(item.product.price_ref),
      cost_ref: parseFloat(item.product.cost_ref || 0),
    }));

    const { data: sale, error: saleError } = await supabase
      .from("cantina_sales")
      .insert({
        items,
        total_ref: totalRef,
        total_bs: totalBs,
        sale_date: getLocalDate(),
        shift_id: activeShift?.id || null,
        ...saleData,
      })
      .select()
      .single();
    if (saleError) throw saleError;

    // Build movements: sale for plain items, recipe_consumption for ingredients of has_recipe items
    const movements = [];
    const ingredientUpdates = []; // {ingredient_id, decrement}
    for (const item of stockBearingItems) {
      if (item.product.has_recipe) {
        const recipe = recipesByProduct[item.product.id] || [];
        for (const ing of recipe) {
          const ingrInfo = ingredientStockById[ing.ingredient_id];
          const needed = Number(ing.quantity) * item.qty;
          movements.push({
            product_id: ing.ingredient_id,
            product_name: ingrInfo?.name || "(ingrediente)",
            movement_type: "recipe_consumption",
            quantity: -needed,
            reference_id: sale.id,
            cost_ref: parseFloat(ingrInfo?.cost_ref || 0),
            notes: `Consumo receta · ${item.product.name}`,
            created_by: user?.name || "Cantina",
          });
          ingredientUpdates.push({ id: ing.ingredient_id, decrement: needed });
        }
      } else {
        movements.push({
          product_id: item.product.id,
          product_name: item.product.name,
          movement_type: "sale",
          quantity: -item.qty,
          reference_id: sale.id,
          cost_ref: parseFloat(item.product.cost_ref || 0),
          notes: saleData.payment_status === "credit" ? `Credito — ${saleData.client_name}` : "Venta cantina",
          created_by: user?.name || "Cantina",
        });
      }
    }
    if (movements.length > 0) {
      const { error: movError } = await supabase.from("stock_movements").insert(movements);
      if (movError) throw movError;
    }

    // Decrement plain product stock (non-recipe items)
    for (const item of stockBearingItems) {
      if (item.product.has_recipe) continue;
      const { error: stockError } = await supabase
        .from("products")
        .update({ stock_quantity: (item.product.stock_quantity ?? 0) - item.qty })
        .eq("id", item.product.id);
      if (stockError) throw stockError;
    }

    // Decrement ingredient stocks (aggregate per ingredient if same one used multiple times)
    const aggIngredient = {};
    for (const u of ingredientUpdates) {
      aggIngredient[u.id] = (aggIngredient[u.id] || 0) + u.decrement;
    }
    for (const ingId of Object.keys(aggIngredient)) {
      const current = ingredientStockById[ingId];
      const newStock = Number(current?.stock_quantity || 0) - aggIngredient[ingId];
      const { error: ingErr } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", ingId);
      if (ingErr) {
        console.error("[RECIPE] inconsistencia: stock_movements OK pero ingredient update fallo", ingId, ingErr);
        alert(`Inconsistencia detectada: el movimiento de stock_movements se grabo pero el ingrediente ${current?.name || ingId} no se actualizo. Revisar manual.`);
      }
    }

    return { sale, items };
  };

  // Confirmation flow — PaymentModal calls these, which set pending + show confirm
  const handlePaymentConfirm = (saleData) => {
    // saleData = { payments: [{method, amount_ref, reference}], change?: {...}, legacy_method }
    setPendingPayment({ type: "sale", saleData });
    setShowConfirm(true);
  };

  const handleCreditConfirm = (creditData) => {
    setPendingPayment({ type: "credit", ...creditData });
    setShowConfirm(true);
  };

  const cancelConfirm = () => {
    setShowConfirm(false);
    setPendingPayment(null);
  };

  const executeConfirmedSale = async () => {
    if (!pendingPayment || processing) return;
    setShowConfirm(false);

    if (pendingPayment.type === "sale") {
      await confirmSale(pendingPayment.saleData);
    } else {
      await confirmCreditSale(pendingPayment);
    }
    setPendingPayment(null);
  };

  // Confirm regular sale (saleData = { payments: [], change?: {kind, amount, method?, client_id?}, legacy_method })
  const confirmSale = async (saleData) => {
    const payments = saleData?.payments || [];
    const change = saleData?.change || null;
    const legacyMethod = saleData?.legacy_method || null;
    const isCortesiaSale = legacyMethod === "cortesia";

    // Defense in depth: cortesia is admin-only and requires saleClient
    if (isCortesiaSale) {
      if (user?.cantinaRole !== "admin") {
        alert("Solo admin puede dar cortesias.");
        return;
      }
      if (!saleClient?.id) {
        alert("Asocia un cliente antes de dar cortesia.");
        return;
      }
    }

    // Reference for legacy field: first payment with reference, or null
    const firstRef = payments.find((p) => p.reference)?.reference || null;

    setProcessing(true);
    try {
      const result = await executeSale({
        payment_status: "paid",
        payment_method: legacyMethod, // 'mixed' | single method | 'cortesia'
        reference: firstRef,
        exchange_rate_bs: rate?.eur || null,
        created_by: user?.name || "Cantina",
        client_id: saleClient?.id || null,
        client_name: saleClient?.name || null,
      });
      if (!result) { setProcessing(false); return; }

      // Insert sale_payments rows
      const paymentRows = payments.map((p) => ({
        id: "csp_" + Math.random().toString(36).slice(2, 14),
        sale_id: result.sale.id,
        payment_method: p.method,
        amount_ref: p.amount_ref,
        amount_bs: p.method === "cash_bs" && rate?.eur ? Number(p.amount_ref) * rate.eur : null,
        exchange_rate: rate?.eur || null,
        reference: p.reference || null,
        is_change: false,
      }));

      // If overpay returned as cash, append a negative-amount row marking the change-out
      if (change && change.kind === "cash" && change.amount > 0) {
        paymentRows.push({
          id: "csp_chg_" + Math.random().toString(36).slice(2, 14),
          sale_id: result.sale.id,
          payment_method: change.method,
          amount_ref: -Math.abs(change.amount),
          amount_bs: change.method === "cash_bs" && rate?.eur ? -Math.abs(change.amount) * rate.eur : null,
          exchange_rate: rate?.eur || null,
          reference: null,
          is_change: true,
          notes: "Vuelto al cliente",
        });
      }
      if (paymentRows.length > 0) {
        const { error: pErr } = await supabase.from("cantina_sale_payments").insert(paymentRows);
        if (pErr) {
          console.error("[SALE_PAYMENTS] insert error:", pErr);
          alert("Inconsistencia: venta creada pero pagos no se grabaron. Revisa con admin. Detalle: " + pErr.message);
        }
      }

      // If overpay returned as client account credit, INSERT client_credits
      if (change && change.kind === "credit" && change.amount > 0 && change.client_id) {
        const { error: ccErr } = await supabase.from("client_credits").insert({
          id: "cc_" + Math.random().toString(36).slice(2, 14),
          client_id: change.client_id,
          amount_ref: change.amount,
          concept: `Sobrepago en venta cantina ${result.sale.id}`,
          created_by: user?.name || "Cantina",
        });
        if (ccErr) console.error("[CLIENT_CREDIT] insert error:", ccErr);
      }

      // Loyalty: award points (non-blocking) — skip on cortesia
      try {
        if (result.sale?.client_id && !isCortesiaSale) {
          await supabase.rpc("award_loyalty_points", { sale_id_param: result.sale.id });
        }
      } catch (e) { console.error("[LOYALTY] award error:", e); }

      // Loyalty: process redemptions in cart (non-blocking)
      const redemptionItems = cart.filter(i => i.isRedemption);
      const redemptionIds = [];
      for (const item of redemptionItems) {
        try {
          const { data } = await supabase.rpc("redeem_loyalty_reward", {
            client_id_param: saleClient?.id, product_id_param: item.redemptionProductId,
            sale_id_param: result.sale.id, redeemed_by_param: user?.name || "Staff",
          });
          if (data?.[0]?.redemption_id) redemptionIds.push(data[0].redemption_id);
        } catch (e) { console.error("[LOYALTY] redeem error:", e); }
      }

      setLastSaleRecord(result.sale);
      setLastSaleTime(Date.now());
      setLastSale({
        items: result.items,
        totalRef,
        totalBs,
        rate: rate?.eur || null,
        paymentMethod: legacyMethod,
        reference: firstRef,
        payments,
        change,
      });
      setCart([]);
      setScreen("success");
      await loadProducts();
      await loadTodayStats();
    } catch (err) {
      alert("Error registrando venta: " + err.message);
    }
    setProcessing(false);
  };

  // Confirm credit sale
  const confirmCreditSale = async ({ clientId, clientName, notes, dueDate }) => {
    setProcessing(true);
    try {
      const result = await executeSale({
        payment_status: "credit",
        payment_method: null,
        client_id: clientId,
        client_name: clientName,
        notes: notes || null,
        exchange_rate_bs: rate?.eur || null,
        created_by: user?.name || "Cantina",
      });
      if (!result) { setProcessing(false); return; }

      // Loyalty: award points on credit sales too (non-blocking)
      try {
        if (result.sale?.client_id) {
          await supabase.rpc("award_loyalty_points", { sale_id_param: result.sale.id });
        }
      } catch (e) { console.error("[LOYALTY] award error:", e); }

      const { error: creditError } = await supabase.from("cantina_credits").insert({
        client_id: clientId || "manual",
        client_name: clientName,
        sale_id: result.sale.id,
        original_amount_ref: totalRef,
        paid_amount_ref: 0,
        status: "pending",
        due_date: dueDate || null,
        notes: notes || null,
        created_by: user?.name || "Cantina",
      });
      if (creditError) throw creditError;

      setLastSaleRecord(result.sale);
      setLastSaleTime(Date.now());
      setLastSale({
        items: result.items,
        totalRef,
        totalBs,
        rate: rate?.eur || null,
        paymentMethod: "credit",
        creditClientName: clientName,
      });
      setCart([]);
      setScreen("success");
      await loadProducts();
      await loadTodayStats();
      await loadPendingCreditsCount();
    } catch (err) {
      alert("Error registrando credito: " + err.message);
    }
    setProcessing(false);
  };

  // Void last sale
  const handleVoidSale = async () => {
    if (!lastSaleRecord || !canVoid) return;
    const confirmed = window.confirm("Seguro que quieres anular esta venta? Se restaurara el stock.");
    if (!confirmed) return;

    setVoidingState(true);
    try {
      const saleId = lastSaleRecord.id;
      const items = lastSaleRecord.items || [];

      // 1a. For non-recipe items: restore product stock directly
      // 1b. For recipe items: restore ingredient stock from stock_movements with type=recipe_consumption
      const { data: existingMovements } = await supabase
        .from("stock_movements")
        .select("product_id, quantity, movement_type")
        .eq("reference_id", saleId);

      // Group restorations by product_id (sum negative quantities to know what to add back)
      const restoreMap = {};
      for (const m of existingMovements || []) {
        // Only restore for sale and recipe_consumption types (qty stored as negative)
        if (m.movement_type === "sale" || m.movement_type === "recipe_consumption") {
          restoreMap[m.product_id] = (restoreMap[m.product_id] || 0) + Math.abs(Number(m.quantity || 0));
        }
      }
      for (const productId of Object.keys(restoreMap)) {
        const { data: prod } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", productId)
          .single();
        if (prod) {
          await supabase
            .from("products")
            .update({ stock_quantity: Number(prod.stock_quantity || 0) + restoreMap[productId] })
            .eq("id", productId);
        }
      }

      // 2. Delete stock movements for this sale
      await supabase.from("stock_movements").delete().eq("reference_id", saleId);

      // 3. Delete credit if it was a credit sale
      if (lastSaleRecord.payment_status === "credit") {
        await supabase.from("cantina_credits").delete().eq("sale_id", saleId);
      }

      // 3b. If sale had overpay -> client_credits row from sobrepago, delete it
      // (cantina_sale_payments rows are removed by FK CASCADE when cantina_sales is deleted —
      //  but we soft-delete via voided_at, so explicit DELETE for the credit record by concept match)
      try {
        await supabase.from("client_credits")
          .delete()
          .eq("concept", `Sobrepago en venta cantina ${saleId}`);
      } catch (e) { console.error("[VOID] client_credits revert error:", e); }

      // 3c. Delete cantina_sale_payments (soft-deleted parent so FK cascade not triggered)
      await supabase.from("cantina_sale_payments").delete().eq("sale_id", saleId);

      // 4. Soft-delete: mark as voided (preserves audit trail)
      await supabase.from("cantina_sales").update({
        voided_at: new Date().toISOString(),
        voided_reason: `Anulada por ${user?.name || "Staff"} dentro de ventana de 5min`,
      }).eq("id", saleId);

      // 4b. Loyalty: reverse points (non-blocking)
      try {
        await supabase.rpc("reverse_loyalty_points", { sale_id_param: saleId });
      } catch (e) { console.error("[LOYALTY] reverse error:", e); }

      // 4c. Loyalty: reverse redemptions if any (non-blocking)
      try {
        const { data: rdms } = await supabase.from("loyalty_redemptions").select("id").eq("related_sale_id", saleId);
        for (const rdm of (rdms || [])) {
          await supabase.rpc("reverse_loyalty_redemption", { redemption_id_param: rdm.id });
        }
      } catch (e) { console.error("[LOYALTY] reverse redemption error:", e); }

      // 5. Record void audit movements (one per restored product)
      for (const productId of Object.keys(restoreMap)) {
        await supabase.from("stock_movements").insert({
          product_id: productId,
          product_name: items.find((i) => i.product_id === productId)?.name || "(restaurado)",
          movement_type: "adjustment",
          quantity: restoreMap[productId],
          notes: `Anulacion venta #${saleId.substring(0, 8)}`,
          created_by: user?.name || "Cantina",
        });
      }

      setLastSaleRecord(null);
      setLastSaleTime(null);
      setLastSale(null);
      setScreen("pos");
      await loadProducts();
      await loadTodayStats();
      await loadPendingCreditsCount();
      alert("Venta anulada correctamente. Stock restaurado.");
    } catch (err) {
      alert("Error anulando venta: " + err.message);
    }
    setVoidingState(false);
  };

  // Keyboard shortcuts: Enter to confirm, Escape to cancel
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Enter" && showConfirm && !processing) {
        e.preventDefault();
        executeConfirmedSale();
      }
      if (e.key === "Escape") {
        if (showConfirm) cancelConfirm();
        else if (screen === "payment") setScreen("pos");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showConfirm, processing, screen]);

  const handleLogout = () => {
    sessionStorage.removeItem("cantina_user");
    router.push("/");
  };

  const handleNewSale = () => {
    setLastSale(null);
    setScreen("pos");
    setSaleClient(null);
    setActiveTab("vender");
  };

  if (!user) return null;

  return (
    <div className="h-screen flex flex-col md:flex-row bg-brand-cream-light overflow-hidden">
      <SideNav activeTab={activeTab} onTabChange={setActiveTab} userRole={user.cantinaRole || "staff"} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 pb-16 md:pb-0">
        {/* Header */}
        <header className="bg-white border-b border-stone-200 px-3 md:px-4 py-2 md:py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 md:gap-3">
            <RateChip rate={rate} />
            <button onClick={() => setShowClientModal(true)}
              className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-1 rounded-lg text-xs text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors">
              <User size={14} /> <span className="hidden sm:inline">Cliente</span>
            </button>
            <button onClick={() => setShowCredits(true)}
              className="hidden md:flex items-center gap-1 px-3 py-1 rounded-lg text-xs text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors relative">
              <CreditCard size={14} /> Creditos
              {pendingCreditsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {pendingCreditsCount}
                </span>
              )}
            </button>
            <GlobalClientSearch />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <ShiftPill
              shift={activeShift}
              onClick={() => activeShift ? setShowCloseShift(true) : setShowOpenShift(true)}
            />
            <span className="hidden md:inline text-xs text-stone-400">{user.name}</span>
            <button onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Tab content */}
        {activeTab === "vender" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {/* Live strip — sutil */}
            <div className="bg-stone-50 border-b border-stone-200 px-4 py-1.5 text-[11px] text-stone-500 flex items-center gap-3 flex-wrap shrink-0">
              <span><span className="text-stone-400">Hoy:</span> <span className="font-semibold text-stone-700">REF {todayStats.total.toFixed(2)}</span></span>
              <span className="text-stone-300">·</span>
              <span>{todayStats.count} venta{todayStats.count === 1 ? "" : "s"}</span>
              {todayStats.lastClient && (
                <>
                  <span className="text-stone-300">·</span>
                  <span><span className="text-stone-400">ult:</span> {todayStats.lastClient.name}</span>
                </>
              )}
            </div>
            <div className="flex min-h-[60vh] shrink-0">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-stone-400 text-sm animate-pulse">Cargando productos...</p>
              </div>
            ) : (
              <>
                <ProductGrid
                  products={products}
                  cart={cart}
                  rate={rate}
                  onAdd={addToCart}
                  lowStockThreshold={lowStockThreshold}
                />
                <CartSidebar
                  cart={cart}
                  rate={rate}
                  onUpdateQty={updateQty}
                  onRemove={removeFromCart}
                  onCheckout={() => {
                    if (!activeShift) { setShowOpenShift(true); return; }
                    setScreen("payment");
                  }}
                  saleClient={saleClient}
                  onAddRedemption={addRedemption}
                />
              </>
            )}
            </div>

            {/* EN VIVO — collapsible dashboard section */}
            <div className="border-t border-stone-200 shrink-0">
              <button
                onClick={() => setLiveExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-stone-50"
              >
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">En Vivo</span>
                <ChevDown size={14} className={`text-stone-400 transition-transform ${liveExpanded ? "rotate-180" : ""}`} />
              </button>
              {liveExpanded && (
                <div>
                  <DashboardView user={user} rate={rate} products={products} embedded />
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "inventario" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <InventarioView user={user} />
          </div>
        )}

        {activeTab === "caja" && user.cantinaRole === "admin" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <CajaView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "eventos" && user.cantinaRole === "admin" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <EventosView user={user} rate={rate} onNavigate={setActiveTab} />
          </div>
        )}

        {activeTab === "reportes" && user.cantinaRole === "admin" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReportesView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "turnos" && user.cantinaRole === "admin" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ShiftsView user={user} />
          </div>
        )}

        {activeTab === "puntos" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <PuntosView user={user} rate={rate} saleClient={saleClient} />
          </div>
        )}

        {activeTab === "clientes" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ClientesView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "config" && user.cantinaRole === "admin" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ConfigView user={user} rate={rate} onRateUpdated={loadRate} />
          </div>
        )}
      </div>

      {/* Payment modal */}
      {screen === "payment" && (
        <PaymentModal
          cart={cart}
          rate={rate}
          processing={processing}
          saleClient={saleClient}
          userRole={user?.cantinaRole || "staff"}
          onAssociateClient={(client) => setSaleClient(client)}
          onConfirm={handlePaymentConfirm}
          onConfirmCredit={handleCreditConfirm}
          onBack={() => setScreen("pos")}
        />
      )}

      {showStockToast && lowStockItems.length > 0 && (
        <StockAlertToast
          items={lowStockItems}
          onDismiss={dismissStockToast}
          onNavigate={() => setActiveTab("inventario")}
        />
      )}

      {/* Confirmation dialog */}
      {showConfirm && pendingPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-stone-800 mb-2">
              {pendingPayment.type === "credit" ? "Confirmar credito?" : "Confirmar venta?"}
            </h3>
            <div className="bg-stone-50 rounded-xl p-3 mb-4 space-y-1">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-stone-600 flex items-center gap-1.5"><ProductImage product={item.product} size={20} /> {item.qty}x {item.product.name}</span>
                  <span className="font-medium">REF {(Number(item.product.price_ref) * item.qty).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-stone-200 pt-1 mt-1 flex justify-between">
                <span className="font-bold text-stone-700">Total</span>
                <span className="font-bold text-brand">REF {totalRef.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-xs text-stone-500 mb-4">
              Esta accion registrara la venta y descontara el stock. Podras anularla durante los proximos 5 minutos.
            </p>
            <div className="flex gap-2">
              <button
                onClick={cancelConfirm}
                className="flex-1 py-3 rounded-xl border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={executeConfirmedSale}
                disabled={processing}
                className="flex-1 py-3 rounded-xl bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
              >
                {processing ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success screen */}
      {screen === "success" && lastSale && (
        <SuccessScreen
          sale={lastSale}
          todayStats={todayStats}
          onNewSale={handleNewSale}
          canVoid={canVoid}
          onVoidSale={handleVoidSale}
        />
      )}

      {showCredits && (
        <CreditsModal
          user={user}
          rate={rate}
          onClose={() => setShowCredits(false)}
          onUpdated={loadPendingCreditsCount}
        />
      )}

      {showOpenShift && (
        <OpenShiftModal
          user={user}
          onOpen={(shift) => { setActiveShift(shift); setShowOpenShift(false); }}
          onClose={() => setShowOpenShift(false)}
        />
      )}

      {showCloseShift && activeShift && (
        <CloseShiftModal
          shift={activeShift}
          rate={rate}
          onClose={() => setShowCloseShift(false)}
          onClosed={() => { setActiveShift(null); setShowCloseShift(false); }}
        />
      )}

      {showClientModal && (
        <ClientModal rate={rate} user={user} onClose={() => setShowClientModal(false)}
          onAssociateClient={(client) => setSaleClient(client)} />
      )}

      <GlobalProfileMount user={user} rate={rate} />
    </div>
  );
}
