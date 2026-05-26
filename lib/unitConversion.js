// Conversión entre unidades compatibles (misma dimensión).
// Cada unidad se mapea a un factor sobre la unidad base de su dimensión:
//   masa     → gramos
//   volumen  → mililitros
//   conteo / loose → cada uno es su propia dimensión (no convierten entre sí)
//
// Uso: convertUnit(200, "g", "kg") → { ok: true, value: 0.2 }
//      convertUnit(1, "kg", "ml")  → { ok: false, reason: "..." }
//
// Si fromUnit === toUnit (case-insensitive trim), retorna value sin tocar.
// Si toUnit o fromUnit son nulos/vacíos, retorna value asumiendo same-unit
// (legacy MPs sin unit_label declarado).

const TO_BASE = {
  // masa → gramo
  mg: { dim: "mass", factor: 0.001 },
  g:  { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  // volumen → mililitro
  ml: { dim: "volume", factor: 1 },
  cl: { dim: "volume", factor: 10 },
  l:  { dim: "volume", factor: 1000 },
  lt: { dim: "volume", factor: 1000 },
  lts:{ dim: "volume", factor: 1000 },
  // conteo (cada palabra es su propia dimensión — solo same-unit válido)
  u:         { dim: "unidad",     factor: 1 },
  unidad:    { dim: "unidad",     factor: 1 },
  paq:       { dim: "paq",        factor: 1 },
  caja:      { dim: "caja",       factor: 1 },
  "u/caja":  { dim: "caja",       factor: 1 },
  cucharada: { dim: "cucharada",  factor: 1 },
  rebanada:  { dim: "rebanada",   factor: 1 },
  rodaja:    { dim: "rodaja",     factor: 1 },
  pizca:     { dim: "pizca",      factor: 1 },
};

const norm = (u) => String(u || "").trim().toLowerCase();

export function convertUnit(value, fromUnit, toUnit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { ok: false, reason: "cantidad inválida" };

  const from = norm(fromUnit);
  const to = norm(toUnit);

  // Fallback: si MP no tiene unit_label (legacy), no convertir.
  // Si ambos vacíos → assumimos misma unidad implícita.
  if (!from || !to) return { ok: true, value: v };
  if (from === to) return { ok: true, value: v };

  const f = TO_BASE[from];
  const t = TO_BASE[to];
  if (!f) return { ok: false, reason: `unidad desconocida en receta: "${fromUnit}"` };
  if (!t) return { ok: false, reason: `unidad desconocida en materia prima: "${toUnit}"` };

  if (f.dim !== t.dim) {
    return { ok: false, reason: `unidades incompatibles: receta en ${fromUnit} no convierte a ${toUnit}` };
  }
  return { ok: true, value: (v * f.factor) / t.factor };
}

// Helper para chequear si dos unidades son compatibles SIN convertir (UI hints).
export function unitsCompatible(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true; // legacy / not declared
  if (na === nb) return true;
  const fa = TO_BASE[na];
  const fb = TO_BASE[nb];
  if (!fa || !fb) return false;
  return fa.dim === fb.dim;
}
