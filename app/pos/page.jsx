"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, CreditCard, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calcBs, ProductImage } from "@/lib/utils";
import SideNav from "@/components/nav/SideNav";
import RateChip from "@/components/shared/RateChip";
import ProductGrid from "@/components/vender/ProductGrid";
import CartSidebar from "@/components/vender/CartSidebar";
import PaymentModal from "@/components/vender/PaymentModal";
import SuccessScreen from "@/components/vender/SuccessScreen";
import CreditsModal from "@/components/vender/CreditsModal";
import ConfigView from "@/components/config/ConfigView";
import InventarioView from "@/components/inventario/InventarioView";
import CajaView from "@/components/caja/CajaView";
import GastosView from "@/components/gastos/GastosView";
import ReportesView from "@/components/reportes/ReportesView";
import DashboardView from "@/components/dashboard/DashboardView";
import ShiftPill from "@/components/shifts/ShiftPill";
import ClientModal from "@/components/client/ClientModal";
import OpenShiftModal from "@/components/shifts/OpenShiftModal";
import CloseShiftModal from "@/components/shifts/CloseShiftModal";
import ShiftsView from "@/components/shifts/ShiftsView";
import PremiosView from "@/components/premios/PremiosView";
import PuntosView from "@/components/puntos/PuntosView";

export default function POSPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("vender");

  // Vender state
  const [screen, setScreen] = useState("pos");
  const [products, setProducts] = useState([]);
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
      .select("total_ref")
      .eq("sale_date", today)
      .is("voided_at", null);
    if (data) {
      setTodayStats({
        total: data.reduce((sum, s) => sum + parseFloat(s.total_ref), 0),
        count: data.length,
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
  }, [user, loadProducts, loadRate, loadTodayStats, loadPendingCreditsCount, loadActiveShift]);

  // Check void window (5 minutes)
  const canVoid = lastSaleRecord && lastSaleTime && (Date.now() - lastSaleTime < 5 * 60 * 1000);

  // Cart operations
  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.qty >= (product.stock_quantity ?? 0)) return prev;
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
    // kind: 'regular' | 'redemption' | 'promo'
    setCart((prev) => prev.filter((item) => {
      if (item.product.id !== productId) return true;
      if (kind === "redemption") return !item.isRedemption;
      if (kind === "promo")      return !item.isPromo;
      // 'regular': remove only non-special variant (keep promos/redemptions)
      return item.isRedemption || item.isPromo;
    }));
  };

  const addRedemption = (product) => {
    // Add as free item — redemption only processed at confirm
    setCart((prev) => {
      if (prev.some(i => i.product.id === product.id && i.isRedemption)) return prev;
      return [...prev, { product: { ...product, price_ref: 0 }, qty: 1, isRedemption: true, redemptionProductId: product.id, redemptionCost: product.redemption_cost_points }];
    });
  };

  const addPromoItem = (product, promoId) => {
    // Add as free item — weekly promo redemption processed at confirm
    setCart((prev) => {
      if (prev.some(i => i.product.id === product.id && i.isPromo)) return prev;
      return [...prev, { product: { ...product, price_ref: 0 }, qty: 1, isPromo: true, promoId }];
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
    // isPromo items have stock managed by redeem_weekly_promo RPC — skip here
    const stockBearingItems = cart.filter((i) => !i.isPromo);

    for (const item of stockBearingItems) {
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
      ...(item.isPromo ? { is_promo: true, promo_id: item.promoId } : {}),
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

    const movements = stockBearingItems.map((item) => ({
      product_id: item.product.id,
      product_name: item.product.name,
      movement_type: "sale",
      quantity: -item.qty,
      reference_id: sale.id,
      cost_ref: parseFloat(item.product.cost_ref || 0),
      notes: saleData.payment_status === "credit" ? `Credito — ${saleData.client_name}` : "Venta cantina",
      created_by: user?.name || "Cantina",
    }));
    const { error: movError } = await supabase.from("stock_movements").insert(movements);
    if (movError) throw movError;

    for (const item of stockBearingItems) {
      const { error: stockError } = await supabase
        .from("products")
        .update({ stock_quantity: (item.product.stock_quantity ?? 0) - item.qty })
        .eq("id", item.product.id);
      if (stockError) throw stockError;
    }

    return { sale, items };
  };

  // Confirmation flow — PaymentModal calls these, which set pending + show confirm
  const handlePaymentConfirm = (method, ref) => {
    setPendingPayment({ type: "sale", method, ref });
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
      await confirmSale(pendingPayment.method, pendingPayment.ref);
    } else {
      await confirmCreditSale(pendingPayment);
    }
    setPendingPayment(null);
  };

  // Confirm regular sale
  const confirmSale = async (method, ref) => {
    // Defense in depth: cortesia is admin-only and requires saleClient
    if (method === "cortesia") {
      if (user?.cantinaRole !== "admin") {
        alert("Solo admin puede dar cortesias.");
        return;
      }
      if (!saleClient?.id) {
        alert("Asocia un cliente antes de dar cortesia.");
        return;
      }
    }

    setProcessing(true);
    try {
      const result = await executeSale({
        payment_status: "paid",
        payment_method: method,
        reference: ref || null,
        exchange_rate_bs: rate?.eur || null,
        created_by: user?.name || "Cantina",
        client_id: saleClient?.id || null,
        client_name: saleClient?.name || null,
      });
      if (!result) { setProcessing(false); return; }

      // Loyalty: award points (non-blocking) — skip on cortesia (gratis = no consumo real)
      try {
        if (result.sale?.client_id && method !== "cortesia") {
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

      // Weekly promos: process promo items in cart (non-blocking)
      const promoItems = cart.filter(i => i.isPromo);
      for (const item of promoItems) {
        try {
          await supabase.rpc("redeem_weekly_promo", {
            promo_id_param:    item.promoId,
            client_id_param:   saleClient?.id,
            sale_id_param:     result.sale.id,
            redeemed_by_param: user?.name || "Staff",
          });
        } catch (e) { console.error("[PROMO] redeem error:", e); }
      }

      setLastSaleRecord(result.sale);
      setLastSaleTime(Date.now());
      setLastSale({
        items: result.items,
        totalRef,
        totalBs,
        rate: rate?.eur || null,
        paymentMethod: method,
        reference: ref,
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

      // 1. Restore stock (skip promo items — handled separately if reverse RPC exists)
      for (const item of items) {
        if (item.is_promo) continue; // promo stock managed by redeem_weekly_promo RPC
        const { data: product } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single();
        if (product) {
          await supabase
            .from("products")
            .update({ stock_quantity: Number(product.stock_quantity || 0) + item.qty })
            .eq("id", item.product_id);
        }
      }

      // 2. Delete stock movements for this sale
      await supabase.from("stock_movements").delete().eq("reference_id", saleId);

      // 3. Delete credit if it was a credit sale
      if (lastSaleRecord.payment_status === "credit") {
        await supabase.from("cantina_credits").delete().eq("sale_id", saleId);
      }

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

      // 5. Record void movement
      for (const item of items) {
        await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          product_name: item.name,
          movement_type: "adjustment",
          quantity: item.qty,
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

      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
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
          <div className="flex-1 flex min-h-0">
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
        )}

        {activeTab === "inventario" && (
          <div className="flex-1 overflow-hidden">
            <InventarioView user={user} />
          </div>
        )}

        {activeTab === "caja" && user.cantinaRole === "admin" && (
          <div className="flex-1 overflow-hidden">
            <CajaView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "gastos" && user.cantinaRole === "admin" && (
          <div className="flex-1 overflow-hidden">
            <GastosView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "reportes" && user.cantinaRole === "admin" && (
          <div className="flex-1 overflow-hidden">
            <ReportesView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "turnos" && user.cantinaRole === "admin" && (
          <ShiftsView user={user} />
        )}

        {activeTab === "dashboard" && (
          <DashboardView user={user} rate={rate} products={products} />
        )}

        {activeTab === "premios" && (
          <div className="flex-1 overflow-hidden">
            <PremiosView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "puntos" && (
          <div className="flex-1 overflow-hidden">
            <PuntosView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "config" && user.cantinaRole === "admin" && (
          <div className="flex-1 overflow-hidden">
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
          onAddPromo={addPromoItem}
          onConfirm={handlePaymentConfirm}
          onConfirmCredit={handleCreditConfirm}
          onBack={() => setScreen("pos")}
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
    </div>
  );
}
