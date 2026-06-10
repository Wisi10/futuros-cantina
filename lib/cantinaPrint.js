"use client";
// ============================================================================
// Generación de recibos y facturas para ventas de cantina.
// Pattern adaptado de futuros-demo/app/lib/print.js — abre window.open con
// HTML + window.print(). No guarda PDF.
//
// generateCantinaReceipt(sale, opts) — recibo no-fiscal
// generateCantinaInvoice(sale, opts) — factura formal con IVA (numerada)
// ============================================================================

const PAYMENT_LABELS = {
  pago_movil: "Pago Móvil",
  zelle: "Zelle",
  cash_usd: "Cash USD",
  cash_bs: "Efectivo Bs",
  datafono: "Tarjeta",
  cortesia: "Cortesía",
  credit: "Crédito",
  mixed: "Mixto",
  transferencia: "Transferencia",
};

const fmtBs = (n) => "Bs " + Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRef = (n) => "REF " + Number(n || 0).toFixed(2);
const fmtUsd = (n) => "$" + Number(n || 0).toFixed(2);

// En cantina, `ref` se guarda en USD (label histórico). Por eso la tasa
// Bs/USD (rate.usd) es la que convierte ref→Bs, no rate.eur (Bs/EUR).
function getRate(sale, rates) {
  const usdRate = Number(sale?.exchange_rate_bs || rates?.usd || 0);
  // Mantengo el objeto con .eur por compatibilidad con callers, pero apunta a la tasa USD.
  return { eur: usdRate, usd: usdRate };
}

function fmtMoney(ref, currency, rate) {
  if (currency === "usd") {
    return fmtUsd(Number(ref) || 0);
  }
  return fmtBs(Number(ref) * rate.usd);
}

function buildItemRows(items, currency, rate) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<tr><td colspan="4" style="text-align:center;color:#999;font-size:11px;">(sin detalle de items)</td></tr>';
  }
  return items.map((it) => {
    const name = it.name || "(producto)";
    const qty = Number(it.qty || it.quantity || 0);
    const unitPrice = Number(it.price_per_unit || it.unit_price_ref || it.price || 0);
    const subtotal = qty * unitPrice;
    return (
      "<tr>" +
      "<td>" + name + "</td>" +
      "<td style=\"text-align:center\">" + qty + "</td>" +
      "<td style=\"text-align:right\">" + fmtMoney(unitPrice, currency, rate) + "</td>" +
      "<td style=\"text-align:right\">" + fmtMoney(subtotal, currency, rate) + "</td>" +
      "</tr>"
    );
  }).join("");
}

function buildPaymentRows(sale, currency, rate, payments) {
  // payments puede venir de cantina_sale_payments (sprint 7B) o legacy de
  // sale.payment_method + total_ref para una sola línea.
  if (Array.isArray(payments) && payments.length > 0) {
    return payments.map((p) => {
      const label = PAYMENT_LABELS[p.payment_method] || p.payment_method || "Pago";
      const amt = Number(p.amount_ref || 0);
      const refLine = p.reference ? ' <span style="color:#888;font-size:10px">ref ' + p.reference + '</span>' : "";
      return (
        "<tr>" +
        "<td>" + label + refLine + "</td>" +
        "<td style=\"text-align:right\">" + fmtMoney(amt, currency, rate) + "</td>" +
        "</tr>"
      );
    }).join("");
  }
  // Fallback legacy: single payment_method
  const label = PAYMENT_LABELS[sale.payment_method] || sale.payment_method || "Pago";
  const amt = Number(sale.total_ref || 0);
  return (
    "<tr>" +
    "<td>" + label + "</td>" +
    "<td style=\"text-align:right\">" + fmtMoney(amt, currency, rate) + "</td>" +
    "</tr>"
  );
}

function openPrintWindow(html) {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank");
  if (!w) {
    alert("El navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.");
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 250);
}

// ============================================================================
// RECIBO NO-FISCAL
// ============================================================================
export function generateCantinaReceipt(sale, { rates, currency = "bs", businessInfo = null, payments = null } = {}) {
  const rate = getRate(sale, rates);
  const items = Array.isArray(sale.items) ? sale.items : [];
  const itemRows = buildItemRows(items, currency, rate);
  const paymentRows = buildPaymentRows(sale, currency, rate, payments);

  const subtotalRef = items.reduce((s, it) => {
    const qty = Number(it.qty || it.quantity || 0);
    const up = Number(it.price_per_unit || it.unit_price_ref || it.price || 0);
    return s + (qty * up);
  }, 0) || Number(sale.total_ref || 0);

  const totalRef = Number(sale.total_ref || subtotalRef);
  const dateStr = sale.sale_date ? new Date(sale.sale_date).toLocaleDateString("es-VE") : new Date().toLocaleDateString("es-VE");
  const timeStr = sale.created_at ? new Date(sale.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }) : "";
  const saleNum = sale.sale_number ? "#" + sale.sale_number : (sale.id ? sale.id.slice(-6).toUpperCase() : "");

  const bizName = businessInfo?.name || "Futuros Sports - Cantina";
  const bizAddr = businessInfo?.address || "Polideportivo Cumbres de Curumo";
  const bizPhone = businessInfo?.phone || "";

  const html =
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>Recibo Cantina " + saleNum + "</title>" +
    "<style>" +
    "body{font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;color:#333}" +
    ".header{text-align:center;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:16px}" +
    ".logo{font-size:18px;font-weight:bold}" +
    ".biz-sub{font-size:11px;color:#666;margin-top:2px}" +
    ".sale-num{font-size:13px;font-weight:bold;margin-top:6px}" +
    "table.details{width:100%;margin:12px 0;border-collapse:collapse}" +
    "table.details td{padding:3px 0;font-size:12px}" +
    "table.details td:first-child{color:#666;width:80px}" +
    ".items-table{width:100%;border-collapse:collapse;margin:12px 0;font-size:11px}" +
    ".items-table th,.items-table td{padding:5px 4px;border-bottom:1px solid #eee;text-align:left}" +
    ".items-table th{background:#f5f5f5;font-weight:600;font-size:10px;text-transform:uppercase;color:#666}" +
    ".total-box{border:1px solid #333;padding:12px;margin:12px 0;text-align:center}" +
    ".total-amount{font-size:22px;font-weight:bold}" +
    ".total-secondary{font-size:11px;color:#666;margin-top:3px}" +
    ".payments-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}" +
    ".payments-table td{padding:3px 0;border-bottom:1px solid #eee}" +
    ".footer{text-align:center;margin-top:20px;padding-top:10px;border-top:1px solid #ccc;color:#666;font-size:11px}" +
    "</style></head>" +
    "<body>" +
    "<div class=\"header\">" +
    "<div class=\"logo\">" + bizName + "</div>" +
    "<div class=\"biz-sub\">" + bizAddr + "</div>" +
    (bizPhone ? "<div class=\"biz-sub\">Tel: " + bizPhone + "</div>" : "") +
    "<div class=\"sale-num\">RECIBO " + saleNum + "</div>" +
    "</div>" +
    "<table class=\"details\">" +
    "<tr><td>Cliente:</td><td>" + (sale.client_name || "Sin cliente") + "</td></tr>" +
    "<tr><td>Fecha:</td><td>" + dateStr + (timeStr ? " · " + timeStr : "") + "</td></tr>" +
    "</table>" +
    "<table class=\"items-table\">" +
    "<thead><tr><th>Producto</th><th style=\"text-align:center\">Cant</th><th style=\"text-align:right\">Precio</th><th style=\"text-align:right\">Subtotal</th></tr></thead>" +
    "<tbody>" + itemRows + "</tbody>" +
    "</table>" +
    "<div class=\"total-box\">" +
    "<div style=\"font-size:11px;color:#666\">Total</div>" +
    "<div class=\"total-amount\">" + fmtMoney(totalRef, currency, rate) + "</div>" +
    // Secundario: si imprimió en $, mostrar Bs. Si imprimió en Bs, mostrar $.
    "<div class=\"total-secondary\">" + fmtMoney(totalRef, currency === "usd" ? "bs" : "usd", rate) + "</div>" +
    "</div>" +
    "<div><div style=\"font-size:10px;color:#666;margin-bottom:4px\">Pagos:</div>" +
    "<table class=\"payments-table\">" + paymentRows + "</table></div>" +
    "<div class=\"footer\">" +
    "<p>Gracias por preferirnos</p>" +
    "<p>" + new Date().toLocaleString("es-VE") + "</p>" +
    "<p>Tasa REF: " + rate.eur.toFixed(2) + " Bs</p>" +
    "</div>" +
    "</body></html>";

  openPrintWindow(html);
}

// ============================================================================
// FACTURA FISCAL (con IVA)
// ============================================================================
export function generateCantinaInvoice(sale, { invoiceNumber, rates, currency = "bs", businessInfo = null, payments = null } = {}) {
  const rate = getRate(sale, rates);
  const items = Array.isArray(sale.items) ? sale.items : [];
  const itemRows = buildItemRows(items, currency, rate);
  const paymentRows = buildPaymentRows(sale, currency, rate, payments);

  // Si has_factura, el sale tiene iva_amount_ref; total_ref incluye IVA o no según convención.
  // Asumimos cantina_sales.total_ref = subtotal SIN IVA y iva_amount_ref = IVA separado.
  // El sistema actual ya factura así.
  const subtotalRef = Number(sale.total_ref || 0);
  const ivaRef = Number(sale.iva_amount_ref || 0);
  const totalRef = subtotalRef + ivaRef;

  const invNum = String(invoiceNumber || 0).padStart(6, "0");
  const dateStr = sale.sale_date ? new Date(sale.sale_date).toLocaleDateString("es-VE") : new Date().toLocaleDateString("es-VE");

  const bizName = businessInfo?.name || "Futuros Sports - Cantina";
  const bizRif = businessInfo?.rif || "";
  const bizAddr = businessInfo?.address || "Polideportivo Cumbres de Curumo";
  const bizPhone = businessInfo?.phone || "";

  const clientCedula = sale.client_cedula || sale.client?.cedula || "";

  const html =
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>Factura " + invNum + "</title>" +
    "<style>" +
    "body{font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:25px;color:#333}" +
    ".header{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px}" +
    ".logo{font-size:18px;font-weight:bold}" +
    ".biz-info{font-size:11px;color:#666;margin-top:3px}" +
    ".invoice-num{font-size:15px;font-weight:bold;margin-top:8px}" +
    ".client-info{background:#f9f9f9;padding:10px;border:1px solid #ddd;margin:12px 0;font-size:12px;line-height:1.6}" +
    ".items-table{width:100%;border-collapse:collapse;margin:12px 0}" +
    ".items-table th,.items-table td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:11px}" +
    ".items-table th{background:#f5f5f5;font-weight:600;text-transform:uppercase;font-size:10px;color:#666}" +
    ".totals{margin:16px 0;border-top:2px solid #333;padding-top:10px}" +
    ".totals .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}" +
    ".totals .total-row{font-size:15px;font-weight:bold;border-top:1px solid #ccc;padding-top:6px;margin-top:6px}" +
    ".payments-section{margin-top:12px}" +
    ".payments-section table{width:100%;border-collapse:collapse}" +
    ".payments-section td{padding:2px 0;font-size:11px;color:#555;border-bottom:1px solid #eee}" +
    ".footer{text-align:center;margin-top:24px;color:#666;font-size:10px;border-top:1px solid #ccc;padding-top:12px}" +
    "</style></head>" +
    "<body>" +
    "<div class=\"header\">" +
    "<div class=\"logo\">" + bizName + "</div>" +
    "<div class=\"biz-info\">" + bizAddr + "</div>" +
    (bizPhone ? "<div class=\"biz-info\">Tel: " + bizPhone + "</div>" : "") +
    (bizRif ? "<div class=\"biz-info\"><strong>RIF: " + bizRif + "</strong></div>" : "<div class=\"biz-info\" style=\"color:#c00;font-weight:bold\">⚠ RIF pendiente — configurar en Config</div>") +
    "<div class=\"invoice-num\">FACTURA N° " + invNum + "</div>" +
    "</div>" +
    "<div class=\"client-info\">" +
    "<strong>Cliente:</strong> " + (sale.client_name || "Sin cliente") + "<br>" +
    "<strong>Cédula/RIF:</strong> " + (clientCedula || "N/A") + "<br>" +
    "<strong>Fecha emisión:</strong> " + dateStr +
    "</div>" +
    "<table class=\"items-table\">" +
    "<thead><tr><th>Producto</th><th style=\"text-align:center\">Cant</th><th style=\"text-align:right\">Precio</th><th style=\"text-align:right\">Subtotal</th></tr></thead>" +
    "<tbody>" + itemRows + "</tbody>" +
    "</table>" +
    "<div class=\"totals\">" +
    "<div class=\"row\"><span>Subtotal:</span><span>" + fmtMoney(subtotalRef, currency, rate) + " <span style=\"color:#888\">(" + fmtMoney(subtotalRef, currency === "usd" ? "bs" : "usd", rate) + ")</span></span></div>" +
    "<div class=\"row\"><span>IVA (16%):</span><span>" + fmtMoney(ivaRef, currency, rate) + " <span style=\"color:#888\">(" + fmtMoney(ivaRef, currency === "usd" ? "bs" : "usd", rate) + ")</span></span></div>" +
    "<div class=\"row total-row\"><span>TOTAL:</span><span>" + fmtMoney(totalRef, currency, rate) + " <span style=\"color:#888\">(" + fmtMoney(totalRef, currency === "usd" ? "bs" : "usd", rate) + ")</span></span></div>" +
    "</div>" +
    "<div class=\"payments-section\"><strong style=\"font-size:11px\">Pagos:</strong>" +
    "<table>" + paymentRows + "</table>" +
    "</div>" +
    "<div class=\"footer\">" +
    "<p>" + bizName + (bizRif ? " | RIF: " + bizRif : "") + "</p>" +
    "<p>" + new Date().toLocaleString("es-VE") + "</p>" +
    "<p>Tasa REF al pago: " + rate.eur.toFixed(2) + " Bs/REF</p>" +
    "</div>" +
    "</body></html>";

  openPrintWindow(html);
}

// Helper: asigna número de factura (atomic via RPC) y retorna el número.
export async function ensureInvoiceNumber(supabase, saleId) {
  const { data, error } = await supabase.rpc("assign_cantina_invoice_number", { p_sale_id: saleId });
  if (error) throw error;
  return data;
}

// Helper: carga business info de app_settings (con fallback)
export async function loadInvoiceBusinessInfo(supabase) {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "cantina_invoice_business")
    .maybeSingle();
  return data?.value || {
    name: "Futuros Sports - Cantina",
    rif: "",
    address: "Polideportivo Cumbres de Curumo",
    phone: "",
    logo_url: null,
  };
}
