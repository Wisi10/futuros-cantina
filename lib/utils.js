"use client";
import React from "react";

export const formatREF = (n) => `REF ${Number(n || 0).toFixed(2)}`;

export const formatBs = (ref, rate) => {
  if (!rate) return "—";
  const bs = Number(ref || 0) * rate;
  return `Bs ${bs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const calcBs = (ref, rate) => (rate ? Number(ref || 0) * rate : null);

export const generateId = () => Math.random().toString(36).substring(2, 11);

// Title-case for product names. Words containing digits stay lowercase
// (e.g. "agua 600ml" stays "Agua 600ml" — unit is not capitalized).
export function toTitleCase(str) {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (/\d/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

// Shared category list for cantina product creation (UI dropdowns).
// Note: DB uses "Snacks" plural — keep aligned.
export const CANTINA_CATEGORIES = ["Bebida", "Comida", "Snacks", "Otro"];

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
  { id: "pago_movil", label: "Pago Movil", icon: "📱", needsRef: true },
  { id: "cash_bs", label: "Efectivo Bs", icon: "💵", needsRef: false },
  { id: "cash_usd", label: "Cash USD", icon: "💲", needsRef: false },
  { id: "zelle", label: "Zelle", icon: "🏦", needsRef: true },
  { id: "cortesia", label: "Cortesia", icon: "🎁", needsRef: false, adminOnly: true, requiresClient: true },
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
  pago_movil: "Pago Movil",
  cash_bs: "Efectivo Bs",
  cash_usd: "Cash USD",
  zelle: "Zelle",
  credit: "Credito",
  cortesia: "Cortesia",
  cripto: "Cripto",
};
