"use client";
import { useState, useRef } from "react";
import { X, Upload, Loader2, AlertTriangle, Camera, FileText, CheckCircle2 } from "lucide-react";

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

export default function InvoiceUploadModal({ onClose }) {
  const [stage, setStage] = useState("idle"); // idle | resizing | extracting | done | error
  const [imagePreview, setImagePreview] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const fileInputRef = useRef(null);

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
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

          {stage === "done" && extracted && (
            <ExtractedPreview data={extracted} imageUrl={imagePreview} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
          <div className="text-xs text-stone-500">
            {stage === "done" && "Vista preliminar (read-only). En el próximo paso podrás editar y confirmar."}
          </div>
          <div className="flex gap-2">
            {stage === "done" && (
              <button onClick={reset} className="px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded-lg text-sm">
                Subir otra
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 bg-stone-700 text-white hover:bg-stone-800 rounded-lg text-sm">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Preview read-only ───────────────────────────────────────
function ExtractedPreview({ data, imageUrl }) {
  const showUsd = data.currency_primary === "USD" || data.total_usd != null;
  const showVes = data.currency_primary === "VES" || data.total_ves != null;

  return (
    <div className="space-y-4">
      {data.needs_review && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
          <AlertTriangle size={14} />
          <span>El sistema detectó ambigüedades en esta factura. Revisa con cuidado antes de confirmar.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Encabezado */}
        <div className="bg-stone-50 rounded-xl p-4 space-y-2">
          <div className="text-xs text-stone-500 uppercase font-medium tracking-wider">Proveedor</div>
          <div className="text-base font-bold text-stone-800">{data.supplier?.name || "—"}</div>
          {data.supplier?.rif && <div className="text-xs text-stone-500">RIF: {data.supplier.rif}</div>}

          <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
            <Field label="Nº factura" value={data.invoice_number} />
            <Field label="Fecha" value={data.invoice_date} />
            <Field label="Condición pago" value={data.payment_terms} />
            <Field label="Moneda" value={data.currency_primary} />
            {data.bcv_rate != null && <Field label="Tasa BCV" value={data.bcv_rate.toFixed(4)} />}
          </div>
        </div>

        {/* Imagen */}
        {imageUrl && (
          <div className="bg-stone-50 rounded-xl p-2 flex items-center justify-center overflow-hidden">
            <img src={imageUrl} alt="Factura" className="max-h-48 object-contain" />
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-2 bg-stone-50 text-xs font-medium text-stone-500 uppercase tracking-wider">
          {data.items.length} {data.items.length === 1 ? "ítem" : "ítems"}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Código</th>
              <th className="text-left px-3 py-2 font-medium">Descripción</th>
              <th className="text-center px-3 py-2 font-medium">Cant.</th>
              {showUsd && <th className="text-right px-3 py-2 font-medium">Precio $</th>}
              {showUsd && <th className="text-right px-3 py-2 font-medium">Total $</th>}
              {showVes && <th className="text-right px-3 py-2 font-medium">Precio Bs</th>}
              {showVes && <th className="text-right px-3 py-2 font-medium">Total Bs</th>}
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i} className={`border-t border-stone-100 ${it.needs_review ? "bg-amber-50/40" : ""}`}>
                <td className="px-3 py-2 text-xs text-stone-500 font-mono">{it.code || "—"}</td>
                <td className="px-3 py-2">
                  {it.description}
                  {it.needs_review && (
                    <AlertTriangle size={12} className="inline-block ml-1.5 text-amber-500" />
                  )}
                </td>
                <td className="px-3 py-2 text-center">{it.quantity}</td>
                {showUsd && <td className="px-3 py-2 text-right">{it.unit_price_usd != null ? `$${it.unit_price_usd.toFixed(2)}` : "—"}</td>}
                {showUsd && <td className="px-3 py-2 text-right font-medium">{it.line_total_usd != null ? `$${it.line_total_usd.toFixed(2)}` : "—"}</td>}
                {showVes && <td className="px-3 py-2 text-right">{it.unit_price_ves != null ? `Bs ${it.unit_price_ves.toLocaleString("es-VE")}` : "—"}</td>}
                {showVes && <td className="px-3 py-2 text-right font-medium">{it.line_total_ves != null ? `Bs ${it.line_total_ves.toLocaleString("es-VE")}` : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      <div className="bg-stone-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          {data.subtotal_usd != null && <TotalRow label="Subtotal $" value={`$${data.subtotal_usd.toFixed(2)}`} />}
          {data.iva_amount_usd != null && data.iva_amount_usd > 0 && <TotalRow label={`IVA ${data.iva_percent || 16}% $`} value={`$${data.iva_amount_usd.toFixed(2)}`} />}
          {data.total_usd != null && <TotalRow label="Total $" value={`$${data.total_usd.toFixed(2)}`} bold />}
        </div>
        <div className="space-y-1">
          {data.subtotal_ves != null && <TotalRow label="Subtotal Bs" value={`Bs ${data.subtotal_ves.toLocaleString("es-VE")}`} />}
          {data.iva_amount_ves != null && data.iva_amount_ves > 0 && <TotalRow label={`IVA ${data.iva_percent || 16}% Bs`} value={`Bs ${data.iva_amount_ves.toLocaleString("es-VE")}`} />}
          {data.total_ves != null && <TotalRow label="Total Bs" value={`Bs ${data.total_ves.toLocaleString("es-VE")}`} bold />}
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          <span><span className="font-medium">Nota:</span> {data.notes}</span>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-stone-500">{label}</div>
      <div className="font-medium text-stone-800">{value || "—"}</div>
    </div>
  );
}

function TotalRow({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-stone-800 text-base pt-1 border-t border-stone-300" : "text-stone-600"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
