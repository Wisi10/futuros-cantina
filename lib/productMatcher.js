// Fuzzy matching de descripciones de facturas contra catalogo de productos.
//
// Las descripciones de facturas vienen en MAYUSCULAS o sin formato consistente:
//   "GLACIER AGUA POTABLE ENVASADA Bot 550ML"
//   "Coca Cola Bombita 355 ml x 16 unid"
//   "PAPELON CON LIMON 2,0 KG (E)"
//
// Los productos del catalogo tienen nombres en Title Case con tildes:
//   "Agua 500ml", "Capuccino Pequeño", "Coca Cola Bombita 355ml"
//
// Estrategia: combinar trigram similarity (robustez a typos/OCR) + token Jaccard
// (peso a palabras completas como tallas/marcas). El score final es 0-1.

function normalize(s) {
  if (typeof s !== "string") return "";
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents (Pequeño → pequeno)
    .replace(/[^\w\s]/g, " ") // remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Tokens son palabras separadas. Tamaños tipo "500ml" quedan como un token
// (importante: "Agua 500ml" vs "Agua 600ml" tienen que distinguirse).
function tokenize(s) {
  return normalize(s).split(" ").filter((t) => t.length > 0);
}

// Trigrams con padding para capturar prefijos/sufijos.
function trigrams(s) {
  const n = normalize(s);
  const padded = `  ${n}  `;
  const grams = new Set();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function trigramScore(a, b) {
  return jaccard(trigrams(a), trigrams(b));
}

function tokenScore(a, b) {
  return jaccard(new Set(tokenize(a)), new Set(tokenize(b)));
}

// Score combinado. Trigram robusto a typos/OCR; tokens peso a palabras
// claves (tamaños). Penalizacion suave si los TAMAÑOS no coinciden (500ml
// vs 600ml deben ser distintos productos).
function sizeMismatchPenalty(a, b) {
  const sizesA = (normalize(a).match(/\d+\s*(ml|l|g|kg|oz|unid|un|gr)/g) || []).join(" ");
  const sizesB = (normalize(b).match(/\d+\s*(ml|l|g|kg|oz|unid|un|gr)/g) || []).join(" ");
  if (!sizesA || !sizesB) return 0; // sin tamaños comparables, no penalizar
  return sizesA === sizesB ? 0 : -0.15;
}

export function scorePair(extracted, productName) {
  const trig = trigramScore(extracted, productName);
  const tok = tokenScore(extracted, productName);
  const penalty = sizeMismatchPenalty(extracted, productName);
  return Math.max(0, 0.55 * trig + 0.45 * tok + penalty);
}

// Devuelve los topN matches (con score y producto). Filtra los muy malos.
// Threshold default 0.25 es permisivo: lo importante es ofrecer sugerencias,
// el staff confirma.
export function findMatches(extracted, products, topN = 3, threshold = 0.25) {
  if (!extracted || !Array.isArray(products)) return [];
  return products
    .map((p) => ({ product: p, score: scorePair(extracted, p.name || "") }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// Para mostrar el % en UI.
export function formatScore(s) {
  return `${Math.round(s * 100)}%`;
}
