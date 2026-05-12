"use client";
import React from "react";

// Roles cantina: staff < gerente < owner. 'admin' es alias legacy de gerente.
export const isManagerOrAbove = (role) => role === "gerente" || role === "owner" || role === "admin";
export const isOwner = (role) => role === "owner";

export const formatREF = (n) => `REF ${Number(n || 0).toFixed(2)}`;

export const formatBs = (ref, rate) => {
  if (!rate) return "—";
  const bs = Number(ref || 0) * rate;
  return `Bs ${bs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const calcBs = (ref, rate) => (rate ? Number(ref || 0) * rate : null);

export const generateId = () => Math.random().toString(36).substring(2, 11);

// Title-case for product names. Splits on spaces, hyphens and slashes
// (re-joining with the original delimiter). For each segment:
//   - has digits and was ALL UPPERCASE in original  -> preserve as-is ("F5", "600ML")
//   - has digits and was not all uppercase          -> lowercase ("600ml", "for2")
//   - no digits                                     -> capitalize first letter only
// Examples:
//   "Hora cancha F5"        -> "Hora Cancha F5"
//   "agua 600ml"            -> "Agua 600ml"
//   "AGUA 600ML"            -> "Agua 600ML"
//   "chocolate cri-cri"     -> "Chocolate Cri-Cri"
//   "yolo batido/liquido"   -> "Yolo Batido/Liquido"
//   "cookies for2"          -> "Cookies for2"  (mixed-case-with-digit -> all lower)
export function toTitleCase(str) {
  if (!str) return "";
  const trimmed = String(str).trim();
  if (!trimmed) return "";

  // Tokenize while preserving delimiters: split on space, hyphen, slash.
  const tokens = trimmed.split(/([\s/-]+)/);

  return tokens
    .map((tok) => {
      // Delimiter chunks (whitespace/-//) — collapse internal whitespace,
      // preserve - and / as-is.
      if (/^[\s/-]+$/.test(tok)) {
        return tok.replace(/\s+/g, " ");
      }
      if (!tok) return tok;

      const hasDigit = /\d/.test(tok);
      const isAllUpper = tok === tok.toUpperCase() && /[A-Z]/.test(tok);

      if (hasDigit) {
        if (isAllUpper) return tok; // preserve "F5", "600ML"
        return tok.toLowerCase();   // "600ml", "for2"
      }
      const lower = tok.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

// Shared category list for cantina product creation (UI dropdowns).
// Note: DB uses "Snacks" plural — keep aligned.
export const CANTINA_CATEGORIES = ["Bebida", "Comida", "Snacks", "Otro"];

// Loyalty: how many points a client earns per REF spent. Hardcoded for now —
// future: read from app_settings.
export const POINTS_PER_REF = 10;

// Compute reward generosity = (price_ref / earned_ref_for_those_points).
// Higher pct = giving up more REF per REF spent. Color thresholds match
// product-margin convention used elsewhere in the cantina UI.
export function calculateRewardGenerosity(priceRefValue, costPoints, pointsPerRef = POINTS_PER_REF) {
  const price = Number(priceRefValue) || 0;
  const cost = Number(costPoints) || 0;
  if (price <= 0 || cost <= 0) {
    return { display: "—", color: "text-stone-400", pct: 0, abs: 0 };
  }
  const refToEarn = cost / pointsPerRef;
  if (refToEarn <= 0) return { display: "—", color: "text-stone-400", pct: 0, abs: 0 };
  const pct = Math.round((price / refToEarn) * 100);
  let color = "text-stone-700";
  if (pct < 30) color = "text-green-600";
  else if (pct < 60) color = "text-yellow-600";
  else color = "text-red-600";
  return {
    display: `${pct}% · REF ${price.toFixed(2)}`,
    color,
    pct,
    abs: price,
  };
}

// Profitability per product (display + color). Returns "—" when data missing.
export function calculateProfitability(priceRef, costRef) {
  const price = Number(priceRef) || 0;
  const cost = Number(costRef) || 0;
  if (price <= 0 || cost <= 0) {
    return { display: "—", color: "text-stone-400", hasData: false };
  }
  const marginAbs = price - cost;
  const marginPct = Math.round((marginAbs / price) * 100);
  let color = "text-stone-700";
  if (marginPct < 0) color = "text-red-600";
  else if (marginPct < 30) color = "text-yellow-600";
  else if (marginPct > 60) color = "text-green-600";
  const sign = marginAbs < 0 ? "-" : "";
  const absDisplay = Math.abs(marginAbs).toFixed(2);
  return {
    display: `${sign}REF ${absDisplay} (${marginPct}%)`,
    color,
    hasData: true,
    marginAbs,
    marginPct,
  };
}

export const EXPENSE_CATEGORIES = [
  "Insumos de cocina",
  "Limpieza y sanidad",
  "Equipos y mantenimiento",
  "Gas y electricidad",
  "Personal temporal",
  "Transporte y fletes",
  "Comisiones y servicios",
  "Otros",
];

export const PAYMENT_METHODS = [
  { id: "datafono", label: "Datafono", icon: "💳", needsRef: true },
  { id: "pago_movil", label: "Pago Movil", icon: "📱", needsRef: true },
  { id: "cash_bs", label: "Efectivo Bs", icon: "💵", needsRef: false },
  { id: "cash_usd", label: "Cash USD", icon: "💲", needsRef: false },
  { id: "zelle", label: "Zelle", icon: "🏦", needsRef: true },
  { id: "cortesia", label: "Cortesia", icon: "🎁", needsRef: false, adminOnly: true, requiresClient: true, exclusive: true },
];

// Methods that DON'T add cash to the drawer (excluded from caja reconcile).
// 'cortesia' is the canonical example. Add future symbolic methods here.
export const NON_CASH_METHODS = ["cortesia"];

// ─── Product Display ───────────────────────────────────────

export function ProductImage({ product, size = 32, className = "" }) {
  if (product?.photo_url) {
    return (
      <img
        src={product.photo_url}
        alt={product?.name || ""}
        loading="lazy"
        style={{ width: size, height: size }}
        className={`object-cover rounded shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex items-center justify-center shrink-0 ${className}`}
    >
      <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>{product?.emoji || "🍽️"}</span>
    </div>
  );
}

// ─── Product Photo Helpers ─────────────────────────────────

export function resizeImageToWebP(file, maxWidth = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/webp",
        0.85
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadProductPhoto(supabaseClient, productId, file) {
  const blob = await resizeImageToWebP(file);
  const path = `${productId}.webp`;
  const { error: uploadErr } = await supabaseClient.storage
    .from("cantina-productos")
    .upload(path, blob, { contentType: "image/webp", upsert: true });
  if (uploadErr) throw uploadErr;
  const { data: urlData } = supabaseClient.storage
    .from("cantina-productos")
    .getPublicUrl(path);
  const url = urlData.publicUrl + "?v=" + Date.now(); // cache bust
  const { error: updateErr } = await supabaseClient
    .from("products")
    .update({ photo_url: url })
    .eq("id", productId);
  if (updateErr) throw updateErr;
  return url;
}

// ─── Constants ─────────────────────────────────────────────

export const METHOD_LABELS = {
  datafono: "Datafono",
  pago_movil: "Pago Movil",
  cash_bs: "Efectivo Bs",
  cash_usd: "Cash USD",
  zelle: "Zelle",
  credit: "Credito",
  cortesia: "Cortesia",
  cripto: "Cripto",
  mixed: "Mixto",
};

// Methods that contribute to physical cash drawer for shift reconcile.
export const CASH_DRAWER_METHODS = ["cash_bs", "cash_usd"];
