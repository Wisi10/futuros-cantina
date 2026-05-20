"use client";
import { useState, useRef, useMemo, useEffect } from "react";
import { X, Upload, Loader2, AlertTriangle, Camera, FileText, CheckCircle2, HelpCircle, Calendar, CreditCard, Clock, Plus, Search, Check } from "lucide-react";
import { findMatches, formatScore } from "@/lib/productMatcher";
import { supabase } from "@/lib/supabase";
import { generateId, toTitleCase, CANTINA_CATEGORIES } from "@/lib/utils";

// Estado de pago inferido de la factura ("CREDITO" / "Pague Antes" / "POR COBRAR"
// → pendiente. "CONTADO" / nada → pagado).
function inferPaymentStatus(extracted) {
  const terms = (extracted?.payment_terms || "").toUpperCase();
  const notes = (extracted?.notes || "").toUpperCase();
  if (terms.includes("CREDITO") || terms.includes("DIAS")) return "pending";
  if (notes.includes("POR COBRAR")) return "pending";
  return "paid";
}

// Hoy en formato YYYY-MM-DD (TZ Caracas — el cliente esta en VE)
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PAYMENT_METHODS = [
  { id: "transferencia", label: "Transferencia" },
  { id: "pago_movil", label: "Pago Móvil" },
  { id: "zelle", label: "Zelle" },
  { id: "cash_usd", label: "Efectivo USD" },
  { id: "cash_bs", label: "Efectivo Bs" },
];

// Convierte el precio unitario de un item a REF (=USD equiv).
// Regla:
// - Si hay unit_price_usd, ese es el costo en REF.
// - Si solo hay unit_price_ves y tasa BCV, convierte: REF = Bs / tasa.
// - Si esta marcado include_iva_in_cost, multiplica por (1 + iva/100).
// Devuelve 0 si no hay datos suficientes.
function itemCostRef(item, draft) {
  let priceRef = 0;
  if (item.unit_price_usd != null && Number.isFinite(item.unit_price_usd)) {
    priceRef = Number(item.unit_price_usd);
  } else if (item.unit_price_ves != null && draft.bcv_rate > 0) {
    priceRef = Number(item.unit_price_ves) / Number(draft.bcv_rate);
  }
  if (draft.include_iva_in_cost && draft.iva_percent) {
    priceRef *= 1 + Number(draft.iva_percent) / 100;
  }
  return priceRef;
}

// Convierte fecha DD/MM/YYYY a ISO YYYY-MM-DD para columnas DATE.
function parseInvoiceDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Resize una imagen para que el lado mayor no pase de MAX_DIM, devuelve base64 JPEG.
// Las facturas tipicas son fotos de 3-8MB; ~1600px de lado mayor + JPEG quality 0.85
// las baja a ~300-500KB sin perder legibilidad para Claude Vision.
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;

async function resizeToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        // dataUrl = "data:image/jpeg;base64,XXXX" → necesitamos solo XXXX
        const base64 = dataUrl.split(",")[1];
        resolve({ base64, dataUrl });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function InvoiceUploadModal({ products = [], user, onClose, onConfirmed }) {
  const [stage, setStage] = useState("idle"); // idle | resizing | extracting | done | saving | error
  const [imagePreview, setImagePreview] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [draft, setDraft] = useState(null); // copia editable del extracted (paso 7)
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRef = useRef(null);

  // Inicializa el draft desde el extracted cuando llega. Agrega campos
  // que el usuario va a editar y que no vienen del modelo (payment_status,
  // due_date, payment_method, etc.). selected_product_id por item se usa
  // en pasos posteriores (Paso 8: crear/seleccionar producto inline).
  useEffect(() => {
    if (!extracted) return;
    setDraft({
      supplier_name: extracted.supplier?.name || "",
      supplier_rif: extracted.supplier?.rif || "",
      invoice_number: extracted.invoice_number || "",
      invoice_date: extracted.invoice_date || "",
      payment_terms: extracted.payment_terms || "",
      currency_primary: extracted.currency_primary || "USD",
      bcv_rate: extracted.bcv_rate,
      iva_percent: extracted.iva_percent,
      total_usd: extracted.total_usd,
      total_ves: extracted.total_ves,
      notes: extracted.notes || "",
      items: (extracted.items || []).map((it) => ({
        ...it,
        selected_product_id: null,
      })),
      // Editables agregados:
      payment_status: inferPaymentStatus(extracted),
      due_date: "",
      payment_method: "transferencia",
      payment_reference: "",
      payment_exchange_rate: extracted.bcv_rate || "",
      paid_at: todayISO(),
      include_iva_in_cost: false, // si on, cost_per_unit = unit_price * (1 + iva/100)
    });
  }, [extracted]);

  const handleFile = async (file) => {
    if (!file) return;
    setErrorMsg(null);
    setExtracted(null);
    setStage("resizing");

    try {
      const { base64, dataUrl } = await resizeToBase64(file);
      setImagePreview(dataUrl);
      setStage("extracting");

      const res = await fetch("/api/extract-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setStage("error");
        setErrorMsg(json.error || `HTTP ${res.status}`);
        return;
      }

      setExtracted(json.data);
      setStage("done");
    } catch (err) {
      setStage("error");
      setErrorMsg(err.message || String(err));
    }
  };

  const reset = () => {
    setStage("idle");
    setImagePreview(null);
    setExtracted(null);
    setDraft(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Confirmar entrada → escribe a Supabase ────────────────
  const handleConfirm = async () => {
    if (!draft) return;

    // Validacion 1: todos los items deben tener producto seleccionado
    const unbound = draft.items.filter((it) => !it.selected_product_id);
    if (unbound.length > 0) {
      alert(`Hay ${unbound.length} ítem${unbound.length === 1 ? "" : "s"} sin producto seleccionado. Liga cada línea a un producto del catálogo o crea uno nuevo.`);
      return;
    }

    // Validacion 2: cantidades y costos positivos
    for (const it of draft.items) {
      if (Number(it.quantity || 0) <= 0) {
        alert(`Item "${it.description}" tiene cantidad ${it.quantity}. Corrígela.`);
        return;
      }
      const costRef = itemCostRef(it, draft);
      if (!(costRef >= 0)) {
        alert(`Item "${it.description}" tiene costo inválido. Revisa precios y tasa BCV.`);
        return;
      }
    }

    // Validacion 3: si va a crédito y no hay supplier, advertir
    if (!draft.supplier_name.trim()) {
      const ok = confirm("No has puesto nombre del proveedor. ¿Continuar igual?");
      if (!ok) return;
    }

    setStage("saving");
    try {
      // 1. Build items payload (formato compatible con RestockForm existente)
      const items = draft.items.map((it) => {
        const costPerUnitRef = itemCostRef(it, draft);
        return {
          product_id: it.selected_product_id,
          name: products.find((p) => p.id === it.selected_product_id)?.name || it.description,
          qty: Number(it.quantity || 0),
          cost_per_unit_ref: costPerUnitRef,
          total_cost_ref: costPerUnitRef * Number(it.quantity || 0),
        };
      });

      const totalCostRef = items.reduce((s, it) => s + it.total_cost_ref, 0);
      const restockDate = parseInvoiceDate(draft.invoice_date) || todayISO();
      const dueDate = draft.payment_status === "pending" && draft.due_date ? draft.due_date : null;
      const isPaid = draft.payment_status === "paid";

      // 2. Insert cantina_restocks
      const { data: restock, error: restockErr } = await supabase
        .from("cantina_restocks")
        .insert({
          restock_date: restockDate,
          items,
          total_cost_ref: totalCostRef,
          supplier: draft.supplier_name.trim() || null,
          notes: [
            draft.invoice_number ? `Factura Nº ${draft.invoice_number}` : null,
            draft.supplier_rif ? `RIF ${draft.supplier_rif}` : null,
            draft.notes,
          ].filter(Boolean).join(" · ") || null,
          created_by: user?.name || "Cantina",
          payment_status: draft.payment_status,
          paid_amount_ref: isPaid ? totalCostRef : 0,
          payment_terms: draft.payment_terms || null,
          due_date: dueDate,
        })
        .select()
        .single();
      if (restockErr) throw restockErr;

      // 3. Stock movements + update products (uno por item)
      for (const item of items) {
        const product = products.find((p) => p.id === item.product_id);

        const { error: movErr } = await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          product_name: item.name,
          movement_type: "restock",
          quantity: item.qty,
          reference_id: restock.id,
          cost_ref: item.cost_per_unit_ref,
          notes: `Factura ${draft.supplier_name || "?"}${draft.invoice_number ? ` Nº${draft.invoice_number}` : ""}`,
          created_by: user?.name || "Cantina",
        });
        if (movErr) throw movErr;

        const newStock = Number(product?.stock_quantity || 0) + item.qty;
        const { error: stockErr } = await supabase
          .from("products")
          .update({ stock_quantity: newStock })
          .eq("id", item.product_id);
        if (stockErr) throw stockErr;
      }

      // 4. Si pagado: insert cantina_restock_payments con la tasa del día
      if (isPaid) {
        const exchangeRate = draft.payment_exchange_rate || draft.bcv_rate || null;
        const amountBs = exchangeRate ? totalCostRef * Number(exchangeRate) : null;
        const { error: payErr } = await supabase.from("cantina_restock_payments").insert({
          restock_id: restock.id,
          amount_ref: totalCostRef,
          amount_bs: amountBs,
          payment_method: draft.payment_method,
          reference: draft.payment_reference || null,
          exchange_rate_bs: exchangeRate,
          paid_at: draft.paid_at || todayISO(),
          notes: null,
          created_by: user?.name || "Cantina",
        });
        if (payErr) throw payErr;
      }

      // 5. Done
      alert(`Entrada registrada${isPaid ? " y pagada" : " (a crédito)"} ✓`);
      if (onConfirmed) onConfirmed();
    } catch (err) {
      setStage("error");
      setErrorMsg(`Error al guardar: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand" />
            <h2 className="font-bold text-stone-800">Subir factura</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 min-h-0">
          {stage === "idle" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="border-2 border-dashed border-stone-300 rounded-xl p-8 text-center w-full max-w-md">
                <Upload size={40} className="mx-auto text-stone-400 mb-3" />
                <p className="text-sm text-stone-600 mb-4">Sube una foto de la factura o nota de entrega del proveedor</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  className="hidden"
                />
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors flex items-center gap-1.5"
                  >
                    <Camera size={14} /> Tomar foto / Subir
                  </button>
                </div>
                <p className="text-xs text-stone-400 mt-3">Claude Vision lee los datos automáticamente</p>
              </div>
            </div>
          )}

          {(stage === "resizing" || stage === "extracting") && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={36} className="text-brand animate-spin" />
              <p className="text-sm text-stone-600">
                {stage === "resizing" ? "Procesando imagen…" : "Extrayendo datos con Claude Vision…"}
              </p>
              <p className="text-xs text-stone-400">Esto puede tardar 5-15 segundos</p>
              {imagePreview && stage === "extracting" && (
                <img src={imagePreview} alt="" className="mt-4 max-h-48 rounded-lg border border-stone-200" />
              )}
            </div>
          )}

          {stage === "error" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <AlertTriangle size={36} className="text-red-500" />
              <p className="text-sm font-medium text-stone-800">Error al procesar la factura</p>
              <p className="text-xs text-stone-500 max-w-md text-center">{errorMsg}</p>
              <button
                onClick={reset}
                className="mt-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark"
              >
                Intentar de nuevo
              </button>
            </div>
          )}

          {stage === "done" && draft && (
            <ExtractedEditor
              draft={draft}
              onUpdate={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              imageUrl={imagePreview}
              products={products}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <div className="text-xs text-stone-500">
            {stage === "done" && draft && (
              <>
                {draft.items.filter((it) => !it.selected_product_id).length > 0
                  ? `${draft.items.filter((it) => !it.selected_product_id).length} ítem(s) sin producto — liga cada línea antes de confirmar`
                  : `${draft.items.length} ítem(s) listos para entrar a inventario`}
              </>
            )}
            {stage === "saving" && "Guardando..."}
          </div>
          <div className="flex gap-2">
            {stage === "done" && (
              <button
                onClick={reset}
                disabled={stage === "saving"}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded-lg text-sm disabled:opacity-50"
              >
                Subir otra
              </button>
            )}
            <button
              onClick={onClose}
              disabled={stage === "saving"}
              className="px-4 py-2 bg-stone-700 text-white hover:bg-stone-800 rounded-lg text-sm disabled:opacity-50"
            >
              Cerrar
            </button>
            {stage === "done" && draft && (
              <button
                onClick={handleConfirm}
                disabled={draft.items.some((it) => !it.selected_product_id) || stage === "saving"}
                className="px-5 py-2 bg-brand text-white hover:bg-brand-dark rounded-lg text-sm font-bold disabled:opacity-40 flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                Confirmar entrada
              </button>
            )}
            {stage === "saving" && (
              <button disabled className="px-5 py-2 bg-brand text-white rounded-lg text-sm font-bold flex items-center gap-1.5 opacity-70">
                <Loader2 size={14} className="animate-spin" /> Guardando...
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Editor (paso 7: editable, paso 8: product picker) ───────
function ExtractedEditor({ draft, onUpdate, imageUrl, products }) {
  const data = draft;
  const showUsd = data.currency_primary === "USD" || data.total_usd != null;
  const showVes = data.currency_primary === "VES" || data.total_ves != null;

  // State: cual fila esta usando el picker (null = ninguna)
  const [pickerForRow, setPickerForRow] = useState(null);

  // Calcula matches contra catalogo para cada item. useMemo evita recalcular
  // en cada render (products puede ser grande).
  const itemMatches = useMemo(() => {
    return data.items.map((it) => findMatches(it.description, products, 3, 0.2));
  }, [data.items, products]);

  // Auto-bind: items con match score >= 0.75 se ligan automaticamente al
  // producto del catalogo. Solo corre una vez por item (cuando todavia no
  // hay selected_product_id).
  useEffect(() => {
    const newItems = data.items.map((it, i) => {
      if (it.selected_product_id !== null) return it; // ya bound o ya negado
      const best = itemMatches[i]?.[0];
      if (best && best.score >= 0.75) {
        return { ...it, selected_product_id: best.product.id };
      }
      return it;
    });
    if (newItems.some((it, i) => it.selected_product_id !== data.items[i].selected_product_id)) {
      onUpdate({ items: newItems });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemMatches]);

  const itemsBound = data.items.filter((it) => it.selected_product_id).length;
  const itemsUnbound = data.items.length - itemsBound;

  // Helpers para editar items
  const updateItem = (idx, patch) => {
    onUpdate({
      items: data.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    });
  };

  const removeItem = (idx) => {
    if (data.items.length <= 1) return;
    onUpdate({ items: data.items.filter((_, i) => i !== idx) });
  };

  // Cuando el ProductPicker devuelve un producto (existente o recien creado)
  const handlePickerResult = (productId) => {
    if (pickerForRow == null) return;
    updateItem(pickerForRow, { selected_product_id: productId });
    setPickerForRow(null);
  };

  // Total recalculado dinamicamente. Si include_iva_in_cost, costo = price * (1 + iva/100).
  const ivaFactor = data.include_iva_in_cost && data.iva_percent ? 1 + Number(data.iva_percent) / 100 : 1;
  const computedTotalUsd = data.items.reduce((s, it) => s + (Number(it.unit_price_usd || 0) * Number(it.quantity || 0)), 0) * ivaFactor;

  return (
    <div className="space-y-4">
      {data.needs_review && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
          <AlertTriangle size={14} />
          <span>El sistema detectó ambigüedades en esta factura. Revisa con cuidado antes de confirmar.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Encabezado editable */}
        <div className="bg-stone-50 rounded-xl p-4 space-y-2">
          <div className="text-xs text-stone-500 uppercase font-medium tracking-wider">Proveedor</div>
          <input
            type="text"
            value={data.supplier_name}
            onChange={(e) => onUpdate({ supplier_name: e.target.value })}
            className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-sm font-bold focus:border-brand focus:outline-none"
            placeholder="Nombre del proveedor"
          />
          <input
            type="text"
            value={data.supplier_rif}
            onChange={(e) => onUpdate({ supplier_rif: e.target.value })}
            className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-xs focus:border-brand focus:outline-none"
            placeholder="RIF (J-XXXXXXXXX-X)"
          />

          <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
            <EditField label="Nº factura" value={data.invoice_number} onChange={(v) => onUpdate({ invoice_number: v })} />
            <EditField label="Fecha (DD/MM/YYYY)" value={data.invoice_date} onChange={(v) => onUpdate({ invoice_date: v })} placeholder="06/05/2026" />
            <EditField label="Condición pago" value={data.payment_terms} onChange={(v) => onUpdate({ payment_terms: v })} placeholder="CONTADO / CREDITO" />
            <div>
              <div className="text-stone-500 mb-0.5">Moneda primaria</div>
              <select
                value={data.currency_primary || "USD"}
                onChange={(e) => onUpdate({ currency_primary: e.target.value })}
                className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none"
              >
                <option value="USD">USD ($)</option>
                <option value="VES">VES (Bs)</option>
              </select>
            </div>
            <EditField
              label="Tasa BCV (Bs/USD)"
              type="number"
              step="0.0001"
              value={data.bcv_rate ?? ""}
              onChange={(v) => onUpdate({ bcv_rate: v === "" ? null : Number(v) })}
              placeholder="486.1955"
            />
            <EditField
              label="IVA %"
              type="number"
              step="1"
              value={data.iva_percent ?? ""}
              onChange={(v) => onUpdate({ iva_percent: v === "" ? null : Number(v) })}
              placeholder="0 / 8 / 16"
            />
          </div>
        </div>

        {/* Imagen */}
        {imageUrl && (
          <div className="bg-stone-50 rounded-xl p-2 flex items-center justify-center overflow-hidden">
            <img src={imageUrl} alt="Factura" className="max-h-72 object-contain" />
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-2 bg-stone-50 text-xs font-medium text-stone-500 uppercase tracking-wider flex justify-between">
          <span>{data.items.length} {data.items.length === 1 ? "ítem" : "ítems"}</span>
          <span className="normal-case font-normal">
            <span className="text-green-600">{itemsBound} con producto</span>
            {itemsUnbound > 0 && <> · <span className="text-amber-700">{itemsUnbound} sin producto</span></>}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Código</th>
              <th className="text-left px-3 py-2 font-medium">Descripción / Match catálogo</th>
              <th className="text-center px-3 py-2 font-medium">Cant.</th>
              {showUsd && <th className="text-right px-3 py-2 font-medium">Precio $</th>}
              {showUsd && <th className="text-right px-3 py-2 font-medium">Total $</th>}
              {showVes && <th className="text-right px-3 py-2 font-medium">Precio Bs</th>}
              {showVes && <th className="text-right px-3 py-2 font-medium">Total Bs</th>}
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => {
              const matches = itemMatches[i] || [];
              const best = matches[0];
              const qty = Number(it.quantity || 0);
              const lineUsd = qty * Number(it.unit_price_usd || 0);
              const lineVes = qty * Number(it.unit_price_ves || 0);
              return (
                <tr key={i} className={`border-t border-stone-100 ${it.needs_review ? "bg-amber-50/40" : ""}`}>
                  <td className="px-2 py-1.5 text-xs text-stone-500 font-mono align-top">{it.code || "—"}</td>
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex items-start gap-1">
                      <input
                        type="text"
                        value={it.description}
                        onChange={(e) => updateItem(i, { description: e.target.value })}
                        className="flex-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-stone-200 focus:border-brand rounded px-1 py-0.5 text-sm focus:outline-none"
                      />
                      {it.needs_review && <AlertTriangle size={12} className="text-amber-500 mt-1 shrink-0" />}
                      <button
                        onClick={() => removeItem(i)}
                        disabled={data.items.length <= 1}
                        className="p-0.5 text-stone-300 hover:text-red-500 disabled:opacity-20"
                        title="Eliminar línea"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <ProductBinding
                      item={it}
                      bestMatch={best}
                      products={products}
                      onOpenPicker={() => setPickerForRow(i)}
                      onUnbind={() => updateItem(i, { selected_product_id: null })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center align-top">
                    <input
                      type="number"
                      step="0.01"
                      value={it.quantity ?? ""}
                      onChange={(e) => updateItem(i, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                      className="w-16 bg-white border border-stone-200 rounded px-1 py-0.5 text-sm text-center focus:border-brand focus:outline-none"
                    />
                  </td>
                  {showUsd && (
                    <td className="px-2 py-1.5 text-right align-top">
                      <input
                        type="number"
                        step="0.01"
                        value={it.unit_price_usd ?? ""}
                        onChange={(e) => updateItem(i, { unit_price_usd: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-20 bg-white border border-stone-200 rounded px-1 py-0.5 text-sm text-right focus:border-brand focus:outline-none"
                      />
                    </td>
                  )}
                  {showUsd && <td className="px-2 py-1.5 text-right font-medium align-top text-stone-700">${lineUsd.toFixed(2)}</td>}
                  {showVes && (
                    <td className="px-2 py-1.5 text-right align-top">
                      <input
                        type="number"
                        step="0.01"
                        value={it.unit_price_ves ?? ""}
                        onChange={(e) => updateItem(i, { unit_price_ves: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-24 bg-white border border-stone-200 rounded px-1 py-0.5 text-sm text-right focus:border-brand focus:outline-none"
                      />
                    </td>
                  )}
                  {showVes && <td className="px-2 py-1.5 text-right font-medium align-top text-stone-700">Bs {lineVes.toLocaleString("es-VE")}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totales + toggle IVA */}
      <div className="bg-stone-50 rounded-xl p-4 space-y-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.include_iva_in_cost}
            onChange={(e) => onUpdate({ include_iva_in_cost: e.target.checked })}
            className="rounded"
          />
          <span className="text-xs">
            Incluir IVA ({data.iva_percent || 0}%) en costo del producto
            <span className="text-stone-400 ml-1">— si la cantina no recupera crédito fiscal, marca esta opción</span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <TotalRow label="Computado (suma líneas)" value={`$${computedTotalUsd.toFixed(2)}`} bold />
            {data.total_usd != null && (
              <TotalRow
                label="Total $ en factura"
                value={`$${data.total_usd.toFixed(2)}`}
                warn={Math.abs(data.total_usd - computedTotalUsd) > 0.5}
              />
            )}
          </div>
          <div className="space-y-1">
            {data.total_ves != null && <TotalRow label="Total Bs en factura" value={`Bs ${data.total_ves.toLocaleString("es-VE")}`} />}
          </div>
        </div>
        {data.total_usd != null && Math.abs(data.total_usd - computedTotalUsd) > 0.5 && (
          <div className="flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle size={12} /> El total no cuadra con la suma de líneas. Revisa qty/precios.
          </div>
        )}
      </div>

      {/* Notas extraídas (read-only — anotaciones del documento) */}
      {data.notes && (
        <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <span><span className="font-medium">Nota detectada:</span> {data.notes}</span>
        </div>
      )}

      {/* Sección de pago */}
      <PaymentSection draft={data} onUpdate={onUpdate} />

      {/* Picker modal (paso 8) */}
      {pickerForRow != null && (
        <ProductPickerModal
          products={products}
          initialQuery={data.items[pickerForRow]?.description || ""}
          matches={itemMatches[pickerForRow] || []}
          onClose={() => setPickerForRow(null)}
          onSelect={handlePickerResult}
        />
      )}
    </div>
  );
}

// ─── ProductBinding: muestra el estado de ligadura del item con un producto ──
function ProductBinding({ item, bestMatch, products, onOpenPicker, onUnbind }) {
  const bound = item.selected_product_id ? products.find((p) => p.id === item.selected_product_id) : null;

  if (bound) {
    return (
      <div className="mt-0.5 flex items-center gap-1 flex-wrap">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 border border-green-300 rounded text-[11px] text-green-800 font-medium">
          <Check size={10} /> {bound.name}
        </span>
        <button onClick={onOpenPicker} className="text-[11px] text-stone-500 hover:text-brand underline-offset-2 hover:underline">
          cambiar
        </button>
        <button onClick={onUnbind} className="text-[11px] text-stone-400 hover:text-red-500" title="Desligar producto">
          <X size={10} />
        </button>
      </div>
    );
  }

  // Unbound
  if (bestMatch) {
    return (
      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[11px]">
        <span className="text-stone-500">Sugerencia:</span>
        <span className="text-stone-700">{bestMatch.product.name}</span>
        <span className="text-stone-400">{formatScore(bestMatch.score)}</span>
        <button
          onClick={onOpenPicker}
          className="px-1.5 py-0.5 bg-stone-100 hover:bg-stone-200 rounded text-stone-600 transition-colors"
        >
          Seleccionar / crear
        </button>
      </div>
    );
  }

  return (
    <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
      <HelpCircle size={10} className="text-amber-600" />
      <span className="text-amber-700">Sin match</span>
      <button
        onClick={onOpenPicker}
        className="px-1.5 py-0.5 bg-brand text-white rounded hover:opacity-90 transition-opacity"
      >
        Buscar / Crear
      </button>
    </div>
  );
}

// ─── ProductPickerModal: buscar existente o crear nuevo ──────
function ProductPickerModal({ products, initialQuery, matches, onClose, onSelect }) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState("search"); // search | create
  const [creating, setCreating] = useState(false);

  // Create form state
  const [createName, setCreateName] = useState(initialQuery);
  const [createCategory, setCreateCategory] = useState("Bebida");
  const [createPriceRef, setCreatePriceRef] = useState("");
  const [createIsCantina, setCreateIsCantina] = useState(true);
  const [createError, setCreateError] = useState("");

  // Search results: trigram score si hay query, sino lista alfabetica
  const searchResults = useMemo(() => {
    if (!query.trim()) {
      return [...products].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
    }
    return findMatches(query, products, 50, 0.1).map((m) => m.product);
  }, [query, products]);

  const handleCreate = async () => {
    if (!createName.trim() || Number(createPriceRef) <= 0) {
      setCreateError("Nombre y precio venta requeridos");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const finalName = toTitleCase(createName);
      // Dup check
      const { data: existing } = await supabase
        .from("products")
        .select("id, name")
        .ilike("name", finalName)
        .limit(1);
      if (existing && existing.length > 0) {
        setCreateError(`Ya existe "${existing[0].name}". Usa el existente.`);
        setCreating(false);
        return;
      }
      const { data: maxRow } = await supabase
        .from("products")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = Number(maxRow?.[0]?.sort_order || 0) + 1;
      const newId = generateId();
      const { error: insertError } = await supabase.from("products").insert({
        id: newId,
        name: finalName,
        category: createCategory,
        price_ref: Number(createPriceRef),
        cost_ref: 0,
        is_cantina: createIsCantina,
        active: true,
        sort_order: nextOrder,
        stock_quantity: 0,
      });
      if (insertError) throw insertError;
      onSelect(newId); // cierra picker y bindea el item
    } catch (e) {
      setCreateError("Error: " + e.message);
    }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
          <h3 className="font-bold text-sm text-stone-800">Seleccionar o crear producto</h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 border-b border-stone-100">
          <button
            onClick={() => setMode("search")}
            className={`px-3 py-2 text-sm rounded-t-lg ${mode === "search" ? "bg-brand text-white" : "text-stone-600 hover:bg-stone-100"}`}
          >
            <Search size={12} className="inline mr-1.5" /> Existente
          </button>
          <button
            onClick={() => setMode("create")}
            className={`px-3 py-2 text-sm rounded-t-lg ${mode === "create" ? "bg-brand text-white" : "text-stone-600 hover:bg-stone-100"}`}
          >
            <Plus size={12} className="inline mr-1.5" /> Crear nuevo
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 min-h-0">
          {mode === "search" && (
            <div className="space-y-2">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
              {matches.length > 0 && !query && (
                <div className="text-xs text-stone-500 mt-2">Sugerencias para esta línea:</div>
              )}
              <div className="space-y-1 max-h-[50vh] overflow-auto">
                {matches.length > 0 && !query && matches.map((m) => (
                  <ProductRow key={m.product.id} product={m.product} score={m.score} onSelect={onSelect} />
                ))}
                {searchResults.length === 0 && (
                  <div className="text-sm text-stone-400 text-center py-6">Sin resultados</div>
                )}
                {searchResults.map((p) => (
                  <ProductRow key={p.id} product={p} onSelect={onSelect} />
                ))}
              </div>
            </div>
          )}

          {mode === "create" && (
            <div className="space-y-3">
              <EditField label="Nombre" value={createName} onChange={setCreateName} placeholder="ej. Coca Cola Bombita 355ml" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-stone-500 text-xs mb-0.5">Categoría</div>
                  <select
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                  >
                    {(CANTINA_CATEGORIES || ["Bebida", "Comida", "Snacks", "Otro"]).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <EditField
                  label="Precio venta $REF"
                  type="number"
                  step="0.01"
                  value={createPriceRef}
                  onChange={setCreatePriceRef}
                  placeholder="0.00"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createIsCantina}
                  onChange={(e) => setCreateIsCantina(e.target.checked)}
                  className="rounded"
                />
                <span>Producto de cantina (se vende en POS)</span>
              </label>
              <p className="text-xs text-stone-400">
                El costo se calcula automáticamente cuando confirmes la entrada (trigger MAC). No hace falta llenarlo aquí.
              </p>
              {createError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{createError}</div>
              )}
              <button
                onClick={handleCreate}
                disabled={creating || !createName.trim() || Number(createPriceRef) <= 0}
                className="w-full px-4 py-2 bg-brand text-white rounded-lg text-sm font-bold disabled:opacity-40 hover:bg-brand-dark flex items-center justify-center gap-2"
              >
                {creating ? <><Loader2 size={14} className="animate-spin" /> Creando...</> : <><Plus size={14} /> Crear y usar</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductRow({ product, score, onSelect }) {
  return (
    <button
      onClick={() => onSelect(product.id)}
      className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 transition-colors flex items-center justify-between gap-2 border border-transparent hover:border-stone-200"
    >
      <span className="text-sm text-stone-800">
        {product.emoji ? `${product.emoji} ` : ""}{product.name}
      </span>
      <span className="flex items-center gap-2 text-xs text-stone-400 shrink-0">
        <span>{product.category}</span>
        <span>stock: {product.stock_quantity ?? 0}</span>
        {score != null && <span className="text-brand font-medium">{formatScore(score)}</span>}
      </span>
    </button>
  );
}

// ─── Seccion de pago: toggle Pagado/Pendiente + campos condicionales ─
function PaymentSection({ draft, onUpdate }) {
  const isPaid = draft.payment_status === "paid";
  const isPartial = draft.payment_status === "partial";

  return (
    <div className="bg-white rounded-xl border-2 border-stone-300 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard size={16} className="text-brand" />
        <h4 className="font-bold text-sm text-stone-800">Estado de pago</h4>
      </div>

      {/* Toggle Pagado / Pendiente */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onUpdate({ payment_status: "paid" })}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            isPaid
              ? "bg-green-100 border-2 border-green-500 text-green-800"
              : "bg-stone-50 border-2 border-stone-200 text-stone-500 hover:border-stone-300"
          }`}
        >
          <CheckCircle2 size={14} className="inline-block mr-1.5" />
          Pagado (de una)
        </button>
        <button
          onClick={() => onUpdate({ payment_status: "pending" })}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            !isPaid && !isPartial
              ? "bg-amber-100 border-2 border-amber-500 text-amber-800"
              : "bg-stone-50 border-2 border-stone-200 text-stone-500 hover:border-stone-300"
          }`}
        >
          <Clock size={14} className="inline-block mr-1.5" />
          A crédito (pago después)
        </button>
      </div>

      {/* Campos condicionales */}
      {isPaid ? (
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div>
            <label className="text-xs text-stone-500 block mb-0.5">Método de pago</label>
            <select
              value={draft.payment_method}
              onChange={(e) => onUpdate({ payment_method: e.target.value })}
              className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <EditField label="Referencia" value={draft.payment_reference} onChange={(v) => onUpdate({ payment_reference: v })} placeholder="Nº ref (opcional)" />
          <EditField label="Fecha del pago" type="date" value={draft.paid_at} onChange={(v) => onUpdate({ paid_at: v })} />
          {(draft.payment_method === "pago_movil" || draft.payment_method === "cash_bs" || draft.payment_method === "transferencia") && (
            <EditField
              label="Tasa Bs/USD del día"
              type="number"
              step="0.0001"
              value={draft.payment_exchange_rate ?? ""}
              onChange={(v) => onUpdate({ payment_exchange_rate: v === "" ? null : Number(v) })}
              placeholder="Editable"
            />
          )}
        </div>
      ) : (
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={12} className="text-stone-500" />
            <label className="text-xs text-stone-500">Vencimiento (opcional)</label>
          </div>
          <input
            type="date"
            value={draft.due_date}
            onChange={(e) => onUpdate({ due_date: e.target.value })}
            className="w-full bg-white border border-stone-300 rounded px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <p className="text-[11px] text-stone-400 mt-1">
            La deuda quedará en "Por pagar" (sub-tab de Inventario). Cuando pagues, capturas la tasa del día.
          </p>
        </div>
      )}
    </div>
  );
}


function EditField({ label, value, onChange, placeholder, type = "text", step }) {
  return (
    <div>
      <div className="text-stone-500 mb-0.5">{label}</div>
      <input
        type={type}
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ""}
        className="w-full bg-white border border-stone-300 rounded px-2 py-1 text-sm focus:border-brand focus:outline-none"
      />
    </div>
  );
}

function TotalRow({ label, value, bold, warn }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-stone-800 text-base pt-1 border-t border-stone-300" : warn ? "text-amber-700" : "text-stone-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
