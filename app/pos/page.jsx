"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, CreditCard, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { calcBs, ProductImage } from "@/lib/utils";
import { convertUnit } from "@/lib/unitConversion";
import SideNav from "@/components/nav/SideNav";
import RateChip from "@/components/shared/RateChip";
import ClientProfileModal from "@/components/clientes/ClientProfileModal";
import { ClientProfileProvider, useClientProfile } from "@/lib/clientProfileContext";
import ProductGrid from "@/components/vender/ProductGrid";
import CartSidebar from "@/components/vender/CartSidebar";
import PaymentModal from "@/components/vender/PaymentModal";
import SuccessScreen from "@/components/vender/SuccessScreen";
import ConfigView from "@/components/config/ConfigView";
import InventarioView from "@/components/inventario/InventarioView";
import CajaView from "@/components/caja/CajaView";
import ReportesView from "@/components/reportes/ReportesView";
import GastosTabView from "@/components/gastos/GastosTabView";
import CalendarioView from "@/components/calendario/CalendarioView";
import AdminView from "@/components/admin/AdminView";
import ShiftPill from "@/components/shifts/ShiftPill";
import ClientModal from "@/components/client/ClientModal";
import OpenShiftModal from "@/components/shifts/OpenShiftModal";
import CloseShiftModal from "@/components/shifts/CloseShiftModal";
import ShiftsView from "@/components/shifts/ShiftsView";
import ClientesView from "@/components/clientes/ClientesView";
import StockAlertToast from "@/components/vender/StockAlertToast";
import DashboardView from "@/components/dashboard/DashboardView";
import GlobalClientSearch from "@/components/shared/GlobalClientSearch";
import WhatsNewModal from "@/components/shared/WhatsNewModal";
import { LATEST as LATEST_WHATS_NEW } from "@/lib/whatsNew";
import OfflineBanner, { ConnectionBadge } from "@/components/shared/OfflineBanner";
import { useConnectionStatus } from "@/lib/useConnectionStatus";
import { enqueueSale, generateLocalSaleId } from "@/lib/offlineQueue";
import { runSync } from "@/lib/syncWorker";
import { loadLowStockThreshold, isLowStock } from "@/lib/stockHelpers";

function GlobalProfileMount({ user, rate, onStartCreditSale }) {
  const { profileId, close } = useClientProfile();
  if (!profileId) return null;
  return (
    <ClientProfileModal
      clientId={profileId}
      user={user}
      rate={rate}
      onClose={close}
      onStartCreditSale={onStartCreditSale}
    />
  );
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
  const [showLiveDashboard, setShowLiveDashboard] = useState(false);
  const [impersonatedRole, setImpersonatedRole] = useState(null);
  const [killswitchSales, setKillswitchSales] = useState({ enabled: false, message: "" });

  // Vender state
  const [screen, setScreen] = useState("pos");
  const [products, setProducts] = useState([]);
  // Mapa { product_id: total_qty } últimos 30d. Vacío hasta que carga.
  const [popularity, setPopularity] = useState({});
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [showStockToast, setShowStockToast] = useState(false);
  const [cart, setCart] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cantina_cart");
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

  // Offline status + sync queue
  const { isOnline, pendingCount, refreshPending } = useConnectionStatus();
  const lastSyncOnlineRef = useRef(true);

  // Void sale state
  const [lastSaleRecord, setLastSaleRecord] = useState(null); // full DB record for void
  const [lastSaleTime, setLastSaleTime] = useState(null); // timestamp for 5-min window
  const [voidingState, setVoidingState] = useState(false); // "voiding" | false

  // Confirmation dialog
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null); // {method, ref} or {credit data}

  // Persist cart to localStorage (sobrevive refresh y cierre de pestana)
  useEffect(() => {
    localStorage.setItem("cantina_cart", JSON.stringify(cart));
  }, [cart]);

  // Moneda principal mostrada en la UI (USD por default, REF opcional).
  // Persistida para que el staff no la cambie cada sesión.
  const [displayCurrency, setDisplayCurrency] = useState(() => {
    if (typeof window === "undefined") return "usd";
    return localStorage.getItem("cantina_display_currency") || "usd";
  });
  useEffect(() => {
    localStorage.setItem("cantina_display_currency", displayCurrency);
  }, [displayCurrency]);

  // Credits state
  const [pendingCreditsCount, setPendingCreditsCount] = useState(0);
  // Subtab inicial al entrar a "clientes" desde el header (botón Créditos).
  // Se consume una sola vez por ClientesView via `initialSubTab` y luego se resetea.
  const [clientesInitialSubTab, setClientesInitialSubTab] = useState(null);

  // Shift state
  const [activeShift, setActiveShift] = useState(null);
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // What's new: si la versión guardada en localStorage difiere de la actual,
  // mostrar modal. Se gatilla cuando el user está cargado.
  useEffect(() => {
    if (!user) return;
    try {
      const lastSeen = localStorage.getItem("cantina_lastSeenWhatsNew");
      if (lastSeen !== LATEST_WHATS_NEW.version) setShowWhatsNew(true);
    } catch {}
  }, [user]);
  const dismissWhatsNew = () => {
    try { localStorage.setItem("cantina_lastSeenWhatsNew", LATEST_WHATS_NEW.version); } catch {}
    setShowWhatsNew(false);
  };
  const [saleClient, setSaleClient] = useState(null); // {id, name, points}

  // Auth check
  useEffect(() => {
    const stored = sessionStorage.getItem("cantina_user");
    if (!stored) { router.push("/"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  // Data loading
  // Cache local con TTL para no esperar red en cada apertura.
  // Mostramos cache inmediato (UI rápida) + refresco en background (stale-while-revalidate).
  const PRODUCTS_CACHE_KEY = "cantina_products_cache_v1";
  const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

  const loadProducts = useCallback(async () => {
    if (!supabase) return;

    // 1. Hidratar UI desde localStorage si hay cache fresco
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(PRODUCTS_CACHE_KEY) : null;
      if (raw) {
        const cached = JSON.parse(raw);
        const age = Date.now() - (cached.timestamp || 0);
        if (cached.products && age < PRODUCTS_CACHE_TTL_MS) {
          setProducts(cached.products);
          if (cached.popularity) setPopularity(cached.popularity);
          setLoading(false);
          // Si el cache es muy fresco (<30s), no molestar la red en absoluto
          if (age < 30 * 1000) return;
        } else if (cached.products) {
          // Cache viejo, igual lo mostramos mientras refrescamos
          setProducts(cached.products);
          if (cached.popularity) setPopularity(cached.popularity);
          setLoading(false);
        }
      }
    } catch (_) { /* cache corrupto, ignorar */ }

    // 2. Refrescar de la red (en background si ya hidratamos)
    const [{ data: prods }, { data: popRows }] = await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("is_cantina", true)
        .eq("active", true)
        .order("sort_order"),
      supabase.rpc("get_product_popularity", { p_days: 30 }),
    ]);
    if (prods) setProducts(prods);
    let popMap = null;
    if (popRows) {
      popMap = {};
      popRows.forEach((r) => { popMap[r.product_id] = Number(r.total_qty) || 0; });
      setPopularity(popMap);
    }
    setLoading(false);

    // 3. Persistir para próxima apertura
    try {
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        products: prods || [],
        popularity: popMap,
      }));
    } catch (_) { /* quota exceeded, ignorar */ }
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
    const { data, error } = await supabase
      .from("shifts")
      .select("*")
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Si la carga falla (red), NO borrar un turno ya conocido: evita que la
    // tablet "pierda" el turno y ofrezca abrir uno nuevo que la DB rechaza.
    if (error) return;
    setActiveShift(data || null);
  }, []);

  // Refresca settings que pueden cambiar mientras el tablet esta abierto (umbral stock, killswitch, tasa).
  // Se llama al inicio y cuando la pestana/app vuelve a tener foco.
  const refreshLiveSettings = useCallback(async () => {
    if (!supabase) return;
    loadLowStockThreshold(supabase).then(setLowStockThreshold);
    const { data: ks } = await supabase.from("app_settings").select("value").eq("key", "killswitch_cantina_sales").maybeSingle();
    setKillswitchSales(ks?.value || { enabled: false, message: "" });
    loadRate();
  }, [loadRate]);

  // Auto-sync: cuando volvemos a online y hay pendientes, procesar la cola
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      runSync().then(() => {
        refreshPending();
        loadProducts().catch(() => {});
        loadTodayStats().catch(() => {});
      });
    }
    // Si pasamos de offline a online, también triggear sync proactivo
    if (isOnline && !lastSyncOnlineRef.current) {
      runSync().then(() => refreshPending());
    }
    lastSyncOnlineRef.current = isOnline;
  }, [isOnline, pendingCount, refreshPending]);

  useEffect(() => {
    if (!user) return;
    loadProducts();
    loadTodayStats();
    loadPendingCreditsCount();
    loadActiveShift();
    refreshLiveSettings();
  }, [user, loadProducts, loadTodayStats, loadPendingCreditsCount, loadActiveShift, refreshLiveSettings]);

  // Auto-refresh settings cuando el tablet vuelve a tener foco (cambio de tab navegador, app foreground).
  // Asi el cambio de umbral/killswitch/tasa hecho en otra pantalla aplica sin reload manual.
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") refreshLiveSettings();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user, refreshLiveSettings]);

  // Refresh settings cuando se vuelve al tab "vender" (ej: admin cambio el umbral en Config y vuelve a vender).
  useEffect(() => {
    if (!user || activeTab !== "vender") return;
    refreshLiveSettings();
  }, [user, activeTab, refreshLiveSettings]);

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

  // Totals (con descuento cantina si el cliente lo tiene)
  const subtotalRef = cart.reduce((sum, item) => sum + Number(item.product.price_ref) * item.qty, 0);
  const discountPct = Number(saleClient?.discount?.pct || 0);
  const discountAmount = subtotalRef > 0 && discountPct > 0 ? subtotalRef * (discountPct / 100) : 0;
  const totalRef = Math.max(0, subtotalRef - discountAmount);
  const totalBs = calcBs(totalRef, rate?.usd);

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
          .select("id, name, stock_quantity, cost_ref, unit_label, unit_size, weight_per_unit, weight_unit")
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
          // Perfil doble: receta en weight_unit (g/ml) e ingrediente con weight_per_unit.
          // Conversión por-producto: needed_in_base = qty_receta / weight_per_unit
          const isDoubleUnit = stock.weight_per_unit && ing.unit === stock.weight_unit;
          let needed;
          if (isDoubleUnit) {
            needed = (Number(ing.quantity) * item.qty) / Number(stock.weight_per_unit);
          } else {
            const conv = convertUnit(Number(ing.quantity) * item.qty, ing.unit, stock.unit_label);
            if (!conv.ok) {
              alert(`Receta de ${item.product.name} inválida — ingrediente ${stock.name}: ${conv.reason}. Arregla la receta o el unit_label de la materia prima desde Inventario.`);
              return null;
            }
            needed = conv.value;
          }
          if (Number(stock.stock_quantity || 0) < needed) {
            const unitLabel = stock.unit_label || "";
            const ok = window.confirm(
              `Falta materia prima para ${item.product.name}: ${stock.name} (necesita ${needed.toFixed(3)} ${unitLabel}, hay ${stock.stock_quantity} ${unitLabel}). Stock quedará negativo. Continuar?`
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

    // cost_ref por-unidad. Para productos con receta, SUMAMOS ingredientes
    // (convertidos a la unidad del MP) × cost_ref del MP. Si el producto tiene
    // recipe_cost_override seteado, ese gana. Sin receta → cost_ref del producto.
    const computeUnitCost = (item) => {
      if (!item.product.has_recipe) {
        return parseFloat(item.product.cost_ref || 0);
      }
      const override = item.product.recipe_cost_override;
      if (override != null && override !== "" && Number.isFinite(Number(override))) {
        return Number(override);
      }
      const recipe = recipesByProduct[item.product.id] || [];
      if (recipe.length === 0) return parseFloat(item.product.cost_ref || 0);
      // Si algún MP no tiene unit_label, el cost_ref del MP puede no estar en
      // unidad atómica (legacy data). Computar daría garbage; mejor caer al
      // cost_ref del producto (que normalmente fue seteado a mano).
      const hasLegacyMp = recipe.some((ing) => {
        const mp = ingredientStockById[ing.ingredient_id];
        return mp && !mp.unit_label;
      });
      if (hasLegacyMp) return parseFloat(item.product.cost_ref || 0);
      let total = 0;
      for (const ing of recipe) {
        const mp = ingredientStockById[ing.ingredient_id];
        if (!mp) continue;
        const conv = convertUnit(Number(ing.quantity), ing.unit, mp.unit_label);
        const qtyInMpUnit = conv.ok ? conv.value : Number(ing.quantity);
        total += qtyInMpUnit * Number(mp.cost_ref || 0);
      }
      return Math.round(total * 10000) / 10000; // 4 decimales para precisión
    };

    const items = cart.map((item) => ({
      product_id: item.product.id,
      name: item.product.name,
      qty: item.qty,
      price_ref: parseFloat(item.product.price_ref),
      cost_ref: computeUnitCost(item),
    }));

    const { data: sale, error: saleError } = await supabase
      .from("cantina_sales")
      .insert({
        items,
        total_ref: totalRef,
        total_bs: totalBs,
        // Snapshot de la tasa al momento de la venta para que recibos reimprimidos
        // muestren el monto Bs correcto incluso si la tasa cambió después.
        exchange_rate_bs: rate?.usd || null,
        subtotal_ref: subtotalRef,
        discount_amount_ref: discountAmount,
        cantina_discount_id: saleClient?.discount?.id || null,
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
          // Misma lógica que el chequeo previo — perfil doble usa weight_per_unit.
          const isDoubleUnit = ingrInfo?.weight_per_unit && ing.unit === ingrInfo?.weight_unit;
          let needed;
          if (isDoubleUnit) {
            needed = (Number(ing.quantity) * item.qty) / Number(ingrInfo.weight_per_unit);
          } else {
            const conv = convertUnit(Number(ing.quantity) * item.qty, ing.unit, ingrInfo?.unit_label);
            needed = conv.ok ? conv.value : Number(ing.quantity) * item.qty;
          }
          movements.push({
            product_id: ing.ingredient_id,
            product_name: ingrInfo?.name || "(ingrediente)",
            movement_type: "recipe_consumption",
            quantity: -needed,
            reference_id: sale.id,
            cost_ref: parseFloat(ingrInfo?.cost_ref || 0),
            notes: `Consumo receta · ${item.product.name} · ${ing.quantity} ${ing.unit || ""} → ${needed.toFixed(3)} ${ingrInfo?.unit_label || ""}`.trim(),
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

    // Decrement plain product stock (non-recipe items) — RPC atomico previene oversells concurrentes
    for (const item of stockBearingItems) {
      if (item.product.has_recipe) continue;
      const { error: stockError } = await supabase.rpc("decrement_product_stock", {
        p_id: item.product.id,
        p_qty: item.qty,
      });
      if (stockError) {
        // Si stock insuficiente, el RPC raise. Mensaje claro al staff.
        throw new Error(stockError.message?.includes("Stock insuficiente")
          ? `Sin stock disponible para ${item.product.name}. Otro vendedor pudo haberlo agotado.`
          : stockError.message);
      }
    }

    // Decrement ingredient stocks (aggregate per ingredient si la misma materia prima se usa varias veces)
    const aggIngredient = {};
    for (const u of ingredientUpdates) {
      aggIngredient[u.id] = (aggIngredient[u.id] || 0) + u.decrement;
    }
    for (const ingId of Object.keys(aggIngredient)) {
      const current = ingredientStockById[ingId];
      const { error: ingErr } = await supabase.rpc("decrement_product_stock", {
        p_id: ingId,
        p_qty: aggIngredient[ingId],
      });
      if (ingErr) {
        console.error("[RECIPE] ingredient update fallo (RPC atomico)", ingId, ingErr);
        alert(`Stock insuficiente en ingrediente ${current?.name || ingId}. Revisar inventario.`);
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

  // Lock sincrono: previene double-submit por click rapido antes de que setProcessing(true) propague
  const processingRef = useRef(false);

  const executeConfirmedSale = async () => {
    if (!pendingPayment || processingRef.current || processing) return;
    processingRef.current = true;
    setShowConfirm(false);

    try {
      if (pendingPayment.type === "sale") {
        await confirmSale(pendingPayment.saleData);
      } else {
        await confirmCreditSale(pendingPayment);
      }
    } finally {
      processingRef.current = false;
      setPendingPayment(null);
    }
  };

  // Confirm regular sale (saleData = { payments: [], change?: {kind, amount, method?, client_id?}, legacy_method })
  const confirmSale = async (saleData) => {
    const payments = saleData?.payments || [];
    const change = saleData?.change || null;
    const legacyMethod = saleData?.legacy_method || null;
    const isCortesiaSale = legacyMethod === "cortesia";
    const tax = saleData?.tax || null;
    const ivaAmountRef = tax ? Number(tax.iva_amount_ref || 0) : 0;
    const igtfAmountRef = tax ? Number(tax.igtf_amount_ref || 0) : 0;
    const hasFactura = !!tax?.has_factura;
    // Si PaymentModal envió un total con impuestos, lo respetamos (el desglose ahí
    // ya consideró IVA/IGTF). Si no, caemos al cálculo base subtotal - descuento.
    const finalTotalRef = tax?.total_with_tax_ref != null
      ? Number(tax.total_with_tax_ref)
      : totalRef;
    const finalTotalBs = rate?.usd ? finalTotalRef * rate.usd : null;

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

    // ========================================================================
    // OFFLINE PATH: enqueue + optimistic success. Sync worker se encarga después.
    // ========================================================================
    if (!isOnline) {
      const localId = generateLocalSaleId();
      const items = cart.map((item) => ({
        product_id: item.product.id,
        name: item.product.name,
        qty: item.qty,
        price_ref: parseFloat(item.product.price_ref),
        cost_ref: parseFloat(item.product.cost_ref || 0),
      }));
      // Payments rows con sale_id placeholder (se reemplaza al sync)
      const paymentRows = payments.map((p) => ({
        id: "csp_" + Math.random().toString(36).slice(2, 14),
        sale_id: localId,
        payment_method: p.method,
        amount_ref: p.amount_ref,
        amount_bs: p.method === "cash_bs" && rate?.usd ? Number(p.amount_ref) * rate.usd : null,
        exchange_rate: rate?.usd || null,
        reference: p.reference || null,
        is_change: false,
      }));
      if (change && change.kind === "cash" && change.amount > 0) {
        paymentRows.push({
          id: "csp_chg_" + Math.random().toString(36).slice(2, 14),
          sale_id: localId,
          payment_method: change.method,
          amount_ref: -Math.abs(change.amount),
          amount_bs: change.method === "cash_bs" && rate?.usd ? -Math.abs(change.amount) * rate.usd : null,
          exchange_rate: rate?.usd || null,
          reference: null,
          is_change: true,
          notes: "Vuelto al cliente",
        });
      }
      // Stock decrements para sync. Recetas se omiten en offline (el sync no las decrementa tampoco; admin ve faltante después).
      const productDecrements = items
        .filter((it) => {
          const prod = products.find((p) => p.id === it.product_id);
          return prod && !prod.has_recipe;
        })
        .map((it) => ({ product_id: it.product_id, qty: it.qty }));

      try {
        await enqueueSale({
          local_id: localId,
          sale_date: getLocalDate(),
          items,
          total_ref: finalTotalRef,
          total_bs: finalTotalBs,
          payment_method: legacyMethod,
          reference: firstRef,
          payment_status: "paid",
          client_id: saleClient?.id || null,
          client_name: saleClient?.name || null,
          exchange_rate_bs: rate?.usd || null,
          has_factura: hasFactura,
          iva_amount_ref: ivaAmountRef,
          created_by: user?.name || "Cantina",
          payments_rows: paymentRows,
          product_decrements: productDecrements,
        });

        // Optimistic UI: decrementar stock local + actualizar UI
        setProducts((prev) => prev.map((p) => {
          const dec = productDecrements.find((d) => d.product_id === p.id);
          if (!dec) return p;
          return { ...p, stock_quantity: Math.max(0, Number(p.stock_quantity || 0) - dec.qty) };
        }));
        setTodayStats((prev) => ({
          total: (prev.total || 0) + finalTotalRef,
          count: (prev.count || 0) + 1,
          lastClient: saleClient?.name || prev.lastClient,
        }));

        setLastSale({
          saleNumber: null, // se asigna al sync
          items: cart.map((it) => ({ name: it.product.name, qty: it.qty, price_ref: it.product.price_ref })),
          subtotalRef: totalRef,
          ivaAmountRef,
          igtfAmountRef,
          hasFactura,
          totalRef: finalTotalRef,
          totalBs: finalTotalBs,
          rate: rate?.usd || null,
          paymentMethod: legacyMethod,
          reference: firstRef,
          payments,
          change,
          isOffline: true,
        });
        setLastSaleRecord({
          id: localId,
          sale_number: null,
          sale_date: getLocalDate(),
          items,
          total_ref: finalTotalRef,
          iva_amount_ref: ivaAmountRef,
          has_factura: hasFactura,
          payment_method: legacyMethod,
          client_id: saleClient?.id || null,
          client_name: saleClient?.name || null,
          created_at: new Date().toISOString(),
          isOffline: true,
        });
        setLastSaleTime(Date.now());
        setCart([]);
        setScreen("success");
        refreshPending();
      } catch (err) {
        alert("Error guardando venta offline: " + err.message);
      }
      return;
    }
    // ========================================================================
    // ONLINE PATH: continúa con el flow normal abajo
    // ========================================================================

    setProcessing(true);
    try {
      const result = await executeSale({
        payment_status: "paid",
        payment_method: legacyMethod, // 'mixed' | single method | 'cortesia'
        reference: firstRef,
        exchange_rate_bs: rate?.usd || null,
        created_by: user?.name || "Cantina",
        client_id: saleClient?.id || null,
        client_name: saleClient?.name || null,
        iva_amount_ref: ivaAmountRef,
        igtf_amount_ref: igtfAmountRef,
        has_factura: hasFactura,
        // Override del total ya calculado en executeSale (base = subtotal - descuento).
        // Esto incluye los impuestos para reflejar lo que efectivamente cobró el staff.
        total_ref: finalTotalRef,
        total_bs: finalTotalBs,
      });
      if (!result) { setProcessing(false); return; }

      // Insert sale_payments rows
      const paymentRows = payments.map((p) => ({
        id: "csp_" + Math.random().toString(36).slice(2, 14),
        sale_id: result.sale.id,
        payment_method: p.method,
        amount_ref: p.amount_ref,
        amount_bs: p.method === "cash_bs" && rate?.usd ? Number(p.amount_ref) * rate.usd : null,
        exchange_rate: rate?.usd || null,
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
          amount_bs: change.method === "cash_bs" && rate?.usd ? -Math.abs(change.amount) * rate.usd : null,
          exchange_rate: rate?.usd || null,
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
        saleNumber: result.sale.sale_number,
        items: result.items,
        subtotalRef: totalRef,
        ivaAmountRef,
        igtfAmountRef,
        hasFactura,
        totalRef: finalTotalRef,
        totalBs: finalTotalBs,
        rate: rate?.usd || null,
        paymentMethod: legacyMethod,
        reference: firstRef,
        payments,
        change,
      });
      setCart([]);
      setScreen("success");
      // Fire-and-forget: UI no espera, refresh en background. Crucial para
      // performance en internet lento de las cajeras.
      loadProducts().catch(() => {});
      loadTodayStats().catch(() => {});
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
        exchange_rate_bs: rate?.usd || null,
        created_by: user?.name || "Cantina",
      });
      if (!result) { setProcessing(false); return; }

      // Loyalty: NO se acumulan puntos cuando la venta es a crédito.
      // Los puntos se otorgan cuando el cliente paga (cantina_credit_payments)
      // vía RPC award_loyalty_for_credit_payment.

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
        saleNumber: result.sale.sale_number,
        items: result.items,
        totalRef,
        totalBs,
        rate: rate?.usd || null,
        paymentMethod: "credit",
        creditClientName: clientName,
      });
      setCart([]);
      setScreen("success");
      // Fire-and-forget — UI no espera red
      loadProducts().catch(() => {});
      loadTodayStats().catch(() => {});
      loadPendingCreditsCount().catch(() => {});
    } catch (err) {
      alert("Error registrando credito: " + err.message);
    }
    setProcessing(false);
  };

  // Void last sale
  const handleVoidSale = async () => {
    if (!lastSaleRecord || !canVoid) return;
    if (voidingState) return; // double-click guard
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
      // Restaurar via RPC atomico (evita race contra otra venta concurrente)
      for (const productId of Object.keys(restoreMap)) {
        const { error: restoreErr } = await supabase.rpc("restore_product_stock", {
          p_id: productId,
          p_qty: restoreMap[productId],
        });
        if (restoreErr) console.error("[VOID] restore_product_stock fallo", productId, restoreErr);
      }

      // Acumular errores no críticos para reportar al final sin abortar el flujo.
      // Si la marca de voided falla (paso 4), eso sí abortamos.
      const voidWarnings = [];

      // 2. Delete stock movements for this sale
      const { error: smErr } = await supabase.from("stock_movements").delete().eq("reference_id", saleId);
      if (smErr) { console.error("[VOID] stock_movements:", smErr); voidWarnings.push("stock movements"); }

      // 3. Delete credit if it was a credit sale
      if (lastSaleRecord.payment_status === "credit") {
        const { error: ccErr } = await supabase.from("cantina_credits").delete().eq("sale_id", saleId);
        if (ccErr) { console.error("[VOID] cantina_credits:", ccErr); voidWarnings.push("crédito cantina"); }
      }

      // 3b. If sale had overpay -> client_credits row from sobrepago, delete it
      // (cantina_sale_payments rows are removed by FK CASCADE when cantina_sales is deleted —
      //  but we soft-delete via voided_at, so explicit DELETE for the credit record by concept match)
      const { error: clcErr } = await supabase.from("client_credits")
        .delete()
        .eq("concept", `Sobrepago en venta cantina ${saleId}`);
      if (clcErr) { console.error("[VOID] client_credits revert:", clcErr); voidWarnings.push("crédito cliente"); }

      // 3c. Delete cantina_sale_payments (soft-deleted parent so FK cascade not triggered)
      const { error: cspErr } = await supabase.from("cantina_sale_payments").delete().eq("sale_id", saleId);
      if (cspErr) { console.error("[VOID] cantina_sale_payments:", cspErr); voidWarnings.push("pagos de venta"); }

      // 4. Soft-delete: mark as voided (preserves audit trail). Si esto falla,
      // la venta sigue activa para el sistema → abortamos para no dejar data inconsistente.
      const { error: voidErr } = await supabase.from("cantina_sales").update({
        voided_at: new Date().toISOString(),
        voided_reason: `Anulada por ${user?.name || "Staff"} dentro de ventana de 5min`,
      }).eq("id", saleId);
      if (voidErr) {
        console.error("[VOID] marca de anulada falló:", voidErr);
        alert(`No se pudo anular la venta (paso final): ${voidErr.message || voidErr}. Cleanup parcial ya ejecutado. Avisa a un admin.`);
        throw voidErr;
      }
      if (voidWarnings.length > 0) {
        // Stock ya restaurado + venta anulada OK, pero hubo limpieza parcial. Avisar al usuario.
        alert(`Venta anulada, pero falló limpieza de: ${voidWarnings.join(", ")}. Avisa a un admin para revisar.`);
      }

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
    // Reset impersonation y carrito al cerrar sesion para evitar arrastres entre usuarios
    setImpersonatedRole(null);
    setCart([]);
    setSaleClient(null);
    localStorage.removeItem("cantina_cart");
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

  // effectiveUser: owner puede previsualizar como otro rol via Admin > Ver como
  const effectiveUser = impersonatedRole
    ? { ...user, cantinaRole: impersonatedRole, _impersonated: true }
    : user;
  // Jerarquia: staff < gerente < owner. canAdmin abarca gerente+owner.
  const effRole = effectiveUser.cantinaRole;
  const canAdmin = effRole === "gerente" || effRole === "owner" || effRole === "admin"; // 'admin' legacy
  const isOwner = effRole === "owner";

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-brand-cream-light overflow-hidden">
      <SideNav activeTab={activeTab} onTabChange={setActiveTab} userRole={effectiveUser.cantinaRole || "staff"} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 pb-16 lg:pb-0">
        {/* Banner offline + sync queue status */}
        <OfflineBanner
          isOnline={isOnline}
          pendingCount={pendingCount}
          onRetry={() => runSync().then(() => refreshPending())}
        />

        {/* Killswitch ventas activado por owner */}
        {killswitchSales.enabled && (
          <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shrink-0">
            <span>🚫 VENTAS BLOQUEADAS — {killswitchSales.message || "Cantina cerrada temporalmente"}</span>
          </div>
        )}

        {/* Banner impersonation */}
        {impersonatedRole && (
          <div className="bg-amber-100 border-b border-amber-300 px-4 py-1.5 flex items-center justify-between text-xs text-amber-900 shrink-0">
            <span>Previsualizando como <b>{impersonatedRole}</b> (rol real: {user.cantinaRole})</span>
            <button
              onClick={() => { setImpersonatedRole(null); setActiveTab("admin"); }}
              className="font-bold underline hover:text-amber-700"
            >
              Volver a mi rol
            </button>
          </div>
        )}

        {/* Floating exit button — visible siempre que se este impersonando */}
        {impersonatedRole && (
          <button
            onClick={() => { setImpersonatedRole(null); setActiveTab("admin"); }}
            className="fixed bottom-6 right-6 z-50 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-xl px-4 py-3 text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}
          >
            <span>← Salir vista {impersonatedRole}</span>
          </button>
        )}

        {/* Header */}
        <header className="bg-white border-b border-stone-200 px-3 md:px-4 py-2 md:py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 md:gap-3">
            <RateChip rate={rate} user={user} onRateUpdated={loadRate} />
            <button onClick={() => setShowClientModal(true)}
              className="flex items-center gap-1 px-2 md:px-3 py-1.5 md:py-1 rounded-lg text-xs text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors">
              <User size={14} /> <span className="hidden sm:inline">Cliente</span>
            </button>
            <button
              onClick={() => {
                setClientesInitialSubTab("deudores");
                setActiveTab("clientes");
              }}
              className="hidden md:flex items-center gap-1 px-3 py-1 rounded-lg text-xs text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors relative">
              <CreditCard size={14} /> Créditos
              {pendingCreditsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {pendingCreditsCount}
                </span>
              )}
            </button>
            <GlobalClientSearch />
            <ConnectionBadge isOnline={isOnline} pendingCount={pendingCount} />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {/* Toggle moneda principal: $ ↔ REF (afecta precios mostrados en POS) */}
            <div className="hidden sm:flex items-center bg-stone-100 rounded-full p-0.5 text-[11px] font-bold">
              <button
                onClick={() => setDisplayCurrency("usd")}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  displayCurrency === "usd" ? "bg-brand text-white shadow" : "text-stone-500 hover:text-stone-700"
                }`}
                title="Mostrar precios en dólares"
              >$</button>
              <button
                onClick={() => setDisplayCurrency("ref")}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  displayCurrency === "ref" ? "bg-brand text-white shadow" : "text-stone-500 hover:text-stone-700"
                }`}
                title="Mostrar precios en REF"
              >REF</button>
            </div>
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
            {/* LEFT: dashboard FIJO arriba + productos con su propio scroll abajo */}
            <div className="flex-1 flex flex-col min-h-0">
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

              {/* Dashboard FIJO arriba (request del owner): cuando está abierto ocupa max-h fijo
                  con scroll interno. NO se mueve al scrollear productos. Toggle a la derecha. */}
              {showLiveDashboard && (
                <div className="border-b border-stone-200 shrink-0 max-h-[40vh] overflow-y-auto bg-white">
                  <DashboardView user={user} rate={rate} products={products} embedded />
                </div>
              )}
              <div className="border-b border-stone-200 shrink-0 flex items-center justify-end px-4 py-1 bg-white">
                <button
                  onClick={() => setShowLiveDashboard(!showLiveDashboard)}
                  className="text-[11px] text-stone-400 hover:text-brand"
                >
                  {showLiveDashboard ? "▲ Ocultar dashboard" : "▼ Mostrar dashboard"}
                </button>
              </div>

              {/* Productos: su propio scroll, no afecta al dashboard de arriba */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-stone-400 text-sm animate-pulse">Cargando productos...</p>
                  </div>
                ) : (
                  <ProductGrid
                    products={products}
                    cart={cart}
                    rate={rate}
                    onAdd={addToCart}
                    lowStockThreshold={lowStockThreshold}
                    displayCurrency={displayCurrency}
                    popularity={popularity}
                  />
                )}
              </div>
            </div>

            {/* RIGHT: carrito sticky - no scrolls con productos */}
            <CartSidebar
              cart={cart}
              rate={rate}
              onUpdateQty={updateQty}
              onRemove={removeFromCart}
              onCheckout={() => {
                if (killswitchSales.enabled) { alert("Ventas bloqueadas: " + (killswitchSales.message || "Cantina cerrada")); return; }
                if (!activeShift) { setShowOpenShift(true); return; }
                setScreen("payment");
              }}
              saleClient={saleClient}
              onAddRedemption={addRedemption}
              subtotalRef={subtotalRef}
              discountAmount={discountAmount}
              discountPct={discountPct}
            />
          </div>
        )}

        {activeTab === "inventario" && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <InventarioView user={effectiveUser} rate={rate} />
          </div>
        )}

        {activeTab === "caja" && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <CajaView user={effectiveUser} rate={rate} />
          </div>
        )}

        {activeTab === "reportes" && canAdmin && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ReportesView
              user={user}
              rate={rate}
              onNavigateToDeudores={() => {
                setClientesInitialSubTab("deudores");
                setActiveTab("clientes");
              }}
            />
          </div>
        )}

        {activeTab === "gastos" && canAdmin && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <GastosTabView user={user} rate={rate} />
          </div>
        )}

        {activeTab === "calendario" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <CalendarioView user={user} rate={rate} onNavigate={setActiveTab} />
          </div>
        )}

        {activeTab === "turnos" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ShiftsView user={user} />
          </div>
        )}

        {activeTab === "clientes" && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ClientesView
              key={clientesInitialSubTab || "default"}
              user={user}
              rate={rate}
              saleClient={saleClient}
              initialSubTab={clientesInitialSubTab}
              onNavigateToVender={(client) => {
                if (client) setSaleClient(client);
                setClientesInitialSubTab(null);
                setActiveTab("vender");
                loadPendingCreditsCount();
              }}
            />
          </div>
        )}

        {activeTab === "config" && canAdmin && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ConfigView user={user} rate={rate} onRateUpdated={loadRate} />
          </div>
        )}

        {activeTab === "admin" && isOwner && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <AdminView
              user={user}
              impersonatedRole={impersonatedRole}
              onImpersonate={setImpersonatedRole}
            />
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
          saleRecord={lastSaleRecord}
          rate={rate}
          todayStats={todayStats}
          onNewSale={handleNewSale}
          canVoid={canVoid}
          saleTimestamp={lastSaleTime}
          onVoidSale={handleVoidSale}
          isOnline={isOnline}
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
          onClosed={() => {
            // Limpiar carrito al cerrar turno para que el siguiente staff arranque limpio
            setCart([]);
            setSaleClient(null);
            localStorage.removeItem("cantina_cart");
            setActiveShift(null);
            setShowCloseShift(false);
          }}
        />
      )}

      {showClientModal && (
        <ClientModal rate={rate} user={user} onClose={() => setShowClientModal(false)}
          onAssociateClient={(client) => setSaleClient(client)} />
      )}

      {showWhatsNew && (
        <WhatsNewModal
          release={LATEST_WHATS_NEW}
          currentUser={{ role: user?.cantinaRole || "staff" }}
          onDismiss={dismissWhatsNew}
        />
      )}

      <GlobalProfileMount
        user={user}
        rate={rate}
        onStartCreditSale={(client) => {
          if (client) setSaleClient(client);
          setClientesInitialSubTab(null);
          setActiveTab("vender");
          loadPendingCreditsCount();
        }}
      />
    </div>
  );
}
