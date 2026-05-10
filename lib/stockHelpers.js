"use client";

// Threshold preference order: per-product low_stock_alert -> global threshold -> default 5
export function effectiveThreshold(product, globalThreshold = 5) {
  const perProduct = Number(product?.low_stock_alert);
  if (Number.isFinite(perProduct) && perProduct > 0) return perProduct;
  return Number(globalThreshold) > 0 ? Number(globalThreshold) : 5;
}

export function isOutOfStock(product) {
  return Number(product?.stock_quantity ?? 0) <= 0;
}

export function isLowStock(product, globalThreshold = 5) {
  if (isOutOfStock(product)) return true;
  return Number(product.stock_quantity) <= effectiveThreshold(product, globalThreshold);
}

// Reads the global threshold from app_settings via the supabase client.
// Returns 5 on any failure.
export async function loadLowStockThreshold(supabase) {
  if (!supabase) return 5;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "low_stock_threshold")
      .single();
    const v = Number(data?.value?.value);
    return Number.isFinite(v) && v > 0 ? v : 5;
  } catch {
    return 5;
  }
}
