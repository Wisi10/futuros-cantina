"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LogOut, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ProductGrid from "@/components/ProductGrid";
import Cart from "@/components/Cart";
import PaymentScreen from "@/components/PaymentScreen";
import SuccessScreen from "@/components/SuccessScreen";

export default function POSPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("pos");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [todayStats, setTodayStats] = useState({ total: 0, count: 0 });
  const [selectedCategory, setSelectedCategory] = useState("todos");

  // Check auth
  useEffect(() => {
    const stored = sessionStorage.getItem("cantina_user");
    if (!stored) {
      router.push("/");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  // Load data
  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (data) setProducts(data);
    setLoading(false);
  }, []);

  const loadRate = useCallback(async () => {
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
    }
  }, []);

  const loadTodayStats = useCallback(async () => {
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

  useEffect(() => {
    if (!user) return;
    loadProducts();
    loadRate();
    loadTodayStats();
  }, [user, loadProducts, loadRate, loadTodayStats]);

  // Cart operations
  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock_quantity) return prev;
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
          if (newQty > item.product.stock_quantity) return item;
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
  const totalBs = rate ? totalRef * rate.eur : null;

  // Confirm sale
  const confirmSale = async (method, ref) => {
    setProcessing(true);
    try {
      const items = cart.map((item) => ({
        product_id: item.product.id,
        name: item.product.name,
        qty: item.qty,
        price_ref: parseFloat(item.product.price_ref),
      }));

      // 1. Insert cantina_sales
      const { data: sale, error: saleError } = await supabase
        .from("cantina_sales")
        .insert({
          items,
          total_ref: totalRef,
          total_bs: totalBs,
          payment_method: method,
          reference: ref || null,
          exchange_rate_id: rate?.id || null,
          created_by: user?.name || "Cantina",
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // 2. Insert stock_movements
      const movements = cart.map((item) => ({
        product_id: item.product.id,
        movement_type: "sale",
        quantity: -item.qty,
        reference_id: sale.id,
        notes: "Venta cantina",
        created_by: user?.name || "Cantina",
      }));

      const { error: movError } = await supabase
        .from("stock_movements")
        .insert(movements);
      if (movError) throw movError;

      // 3. Update products stock
      for (const item of cart) {
        const { error: stockError } = await supabase
          .from("products")
          .update({ stock_quantity: item.product.stock_quantity - item.qty })
          .eq("id", item.product.id);
        if (stockError) throw stockError;
      }

      setLastSale({
        items,
        totalRef,
        totalBs,
        paymentMethod: method,
        reference: ref,
        createdAt: sale.created_at,
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
    <div className="h-screen flex flex-col bg-brand-cream-light overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-brand text-sm">Futuros Cantina</h1>
          {rate ? (
            <div className="bg-brand-cream border border-brand-cream px-3 py-1 rounded-lg text-xs text-brand">
              <span className="font-bold">1 REF = {rate.eur.toFixed(2)} Bs</span>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 px-3 py-1 rounded-lg text-xs text-yellow-700 flex items-center gap-1">
              <AlertTriangle size={12} />
              Sin tasa del día — contacta al administrador
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400">{user.name}</span>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main POS layout */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-stone-400 text-sm animate-pulse">Cargando productos...</p>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <ProductGrid
            products={products}
            cart={cart}
            rate={rate}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            onAdd={addToCart}
          />
          <Cart
            cart={cart}
            rate={rate}
            onUpdateQty={updateQty}
            onRemove={removeFromCart}
            onCheckout={() => setScreen("payment")}
          />
        </div>
      )}

      {/* Payment overlay */}
      {screen === "payment" && (
        <PaymentScreen
          cart={cart}
          rate={rate}
          processing={processing}
          onConfirm={confirmSale}
          onBack={() => setScreen("pos")}
        />
      )}

      {/* Success overlay */}
      {screen === "success" && lastSale && (
        <SuccessScreen
          sale={lastSale}
          todayStats={todayStats}
          onNewSale={handleNewSale}
        />
      )}
    </div>
  );
}
