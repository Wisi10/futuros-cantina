"use client";

const AVATAR_PALETTE = [
  { bg: "bg-amber-100", text: "text-amber-800" },
  { bg: "bg-blue-100",  text: "text-blue-800"  },
  { bg: "bg-teal-100",  text: "text-teal-800"  },
  { bg: "bg-purple-100", text: "text-purple-800" },
  { bg: "bg-pink-100",  text: "text-pink-800"  },
];

export function avatarColor(name) {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function avatarInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0][0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

// Returns "hace 2d", "hace 3h", "hace 5min", "hace un momento", "—"
export function relativeFromNow(iso) {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return "hace un momento";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `hace ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  const months = Math.floor(d / 30);
  if (months < 12) return `hace ${months}m`;
  return `hace ${Math.floor(months / 12)}a`;
}

// Days since iso (positive number) or null
export function daysSince(iso) {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.floor((Date.now() - ts) / 86400000);
}

// Loose Venezuelan phone formatting: groups by 4. If user typed something
// odd we leave it untouched.
export function formatVePhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("58")) {
    // 58XXXXXXXXX -> +58 XXX-XXX-XXXX
    return `+58 ${digits.slice(2, 5)}-${digits.slice(5, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(phone);
}
