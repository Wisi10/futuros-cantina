"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LogOut, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calcBs } from "@/lib/utils";
import SideNav from "@/components/nav/SideNav";
import RateChip from "@/components/shared/RateChip";
import ProductGrid from "@/components/vender/ProductGrid";
import CartSidebar from "@/components/vender/CartSidebar";
import PaymentModal from "@/components/vender/PaymentModal";
import SuccessScreen from "@/components/vender/SuccessScreen";
import CreditsModal from "@/components/vender/CreditsModal";
import ConfigView from "@/components/config/ConfigView";
import InventarioView from "@/components/inventario/InventarioView";
import GastosView from "@/components/gastos/GastosView";
import ReportesView from "@/components/reportes/ReportesView";

export default function POSPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("vender");

  // Vender state
  const [screen, setScreen] = useState("pos");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [todayStats, setTodayStats] = useState({ total: 0, count: 0 });
  const [selectedCategory, setSelectedCategory] = useState("todos");

  // Credits state
  const [showCredits, setShowCredits] = useState(false);
  const [pendingCreditsCount, setPendingCreditsCount] = useState(0);

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
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("exchange_rates")
      .select("*")
      .gte("created_at", today + "T00:00:00")
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.length) {
      setRate({
        id: data[0].id,
        eur: parseFloat(data[0].eur_rate),
        usd: parseFloat(data[0].usd_rate),
      });
    } else {
      setRate(null);
    }
  }, []);

  const loadTodayStats = useCallback(async () => {
    if (!supabase) return;
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("cantina_sales")
      .select("total_ref")
      .eq("sale_date", today);
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

  useEffect(() => {
    if (!user) return;
    loadProducts();
    loadRate();
    loadTodayStats();
    loadPendingCreditsCount();
  }, [user, loadProducts, loadRate, loadTodayStats, loadPendingCreditsCount]);

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

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // Totals
  const totalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const totalBs = calcBs(totalRef, rate?.eur);

  // Shared sale logic (stock verify + items + movements + stock update)
  const executeSale = async (saleData) => {
    // Verify stock
    for (const item of cart) {
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

    // 1. Insert cantina_sales
    const { data: sale, error: saleError } = await supabase
      .from("cantina_sales")
      .insert({ items, total_ref: totalRef, total_bs: totalBs, ...saleData })
      .select()
      .single();
    if (saleError) throw saleError;

    // 2. Insert stock_movements
    const movements = cart.map((item) => ({
      product_id: item.product.id,
      product_name: item.product.name,
      movement_type: "sale",
      quantity: -item.qty,
      reference_id: sale.id,
      cost_ref: parseFloat(item.product.cost_ref || 0),
      notes: saleData.payment_status === "credit" ? `Crédito — ${saleData.client_name}` : "Venta cantina",
      created_by: user?.name || "Cantina",
    }));
    const { error: movError } = await supabase.from("stock_movements").insert(movements);
    if (movError) throw movError;

    // 3. Update product stock
    for (const item of cart) {
      const { error: stockError } = await supabase
        .from("products")
        .update({ stock_quantity: (item.product.stock_quantity ?? 0) - item.qty })
        .eq("id", item.product.id);
      if (stockError) throw stockError;
    }

    return { sale, items };
  };

  // Confirm regular sale
  const confirmSale = async (method, ref) => {
    setProcessing(true);
    try {
      const result = await executeSale({
        payment_status: "paid",
        payment_method: method,
        reference: ref || null,
        exchange_rate_bs: rate?.eur || null,
        created_by: user?.name || "Cantina",
      });
      if (!result) { setProcessing(false); return; }

      setLastSale({
        items: result.items,
        totalRef,
        totalBs,
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

      // Insert cantina_credits
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

      setLastSale({
        items: result.items,
        totalRef,
        totalBs,
        paymentMethod: "credit",
        creditClientName: clientName,
      });
      setCart([]);
      setScreen("success");
      await loadProducts();
      await loadTodayStats();
      await loadPendingCreditsCount();
    } catch (err) {
      alert("Error registrando crédito: " + err.message);
    }
    setProcessing(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("cantina_user");
    router.push("/");
  };

  const handleNewSale = () => {
    setLastSale(null);
    setScreen("pos");
  };

  if (!user) return null;

  return (
    <div className="h-screen flex bg-brand-cream-light overflow-hidden">
      <SideNav activeTab={activeTab} onTabChange={setActiveTab} userRole={user.role} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-stone-200 px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <RateChip rate={rate} />
            <button
              onClick={() => setShowCredits(true)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors relative"
            >
              <CreditCard size={14} /> Créditos
              {pendingCreditsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {pendingCreditsCount}
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-400">{user.name}</span>
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
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  onAdd={addToCart}
                />
                <CartSidebar
                  cart={cart}
                  rate={rate}
                  onUpdateQty={updateQty}
                  onRemove={removeFromCart}
                  onCheckout={() => setScreen("payment")}
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

        {activeTab === "gastos" && (
          <div className="flex-1 overflow-hidden">
            <GastosView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "reportes" && (
          <div className="flex-1 overflow-hidden">
            <ReportesView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "config" && (
          <div className="flex-1 overflow-hidden">
            <ConfigView user={user} rate={rate} onRateUpdated={loadRate} />
          </div>
        )}
      </div>

      {/* Overlays */}
      {screen === "payment" && (
        <PaymentModal
          cart={cart}
          rate={rate}
          processing={processing}
          onConfirm={confirmSale}
          onConfirmCredit={confirmCreditSale}
          onBack={() => setScreen("pos")}
        />
      )}

      {screen === "success" && lastSale && (
        <SuccessScreen
          sale={lastSale}
          todayStats={todayStats}
          onNewSale={handleNewSale}
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
    </div>
  );
}
