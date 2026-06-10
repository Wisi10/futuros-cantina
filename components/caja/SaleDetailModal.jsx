"use client";
import { useState, useEffect } from "react";
import { X, Printer, FileText, Loader2, Receipt, User, Clock, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { METHOD_LABELS, formatBs } from "@/lib/utils";
import { generateCantinaReceipt, generateCantinaInvoice, ensureInvoiceNumber, loadInvoiceBusinessInfo } from "@/lib/cantinaPrint";

// Modal con detalle completo de una venta + botones de impresión.
// Reusa el patrón de SuccessScreen (incluyendo captura inline de cédula
// para facturas cuando faltan datos fiscales).
export default function SaleDetailModal({ sale, rate, onClose }) {
  const [businessInfo, setBusinessInfo] = useState(null);
  const [payments, setPayments] = useState([]);
  const [printing, setPrinting] = useState(null);

  // Captura cédula fiscal inline si falta
  const [fiscalDataOpen, setFiscalDataOpen] = useState(false);
  const [fiscalName, setFiscalName] = useState("");
  const [fiscalCedula, setFiscalCedula] = useState("");
  const [pendingCurrency, setPendingCurrency] = useState(null);
  const [saleSnapshot, setSaleSnapshot] = useState(sale);

  useEffect(() => { setSaleSnapshot(sale); }, [sale]);

  useEffect(() => {
    if (!sale?.id) return;
    loadInvoiceBusinessInfo(supabase).then(setBusinessInfo).catch(() => {});
    supabase
      .from("cantina_sale_payments")
      .select("*")
      .eq("sale_id", sale.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setPayments(data || []));
  }, [sale?.id]);

  if (!sale) return null;

  const items = saleSnapshot.items || [];
  const time = saleSnapshot.created_at
    ? new Date(saleSnapshot.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })
    : "";
  const dateStr = saleSnapshot.sale_date
    ? new Date(saleSnapshot.sale_date).toLocaleDateString("es-VE")
    : "";

  const hasFiscalData = () => {
    const name = (saleSnapshot.client_name || "").trim();
    const cedula = (saleSnapshot.client_cedula || "").trim();
    return name.length > 0 && cedula.length > 0;
  };

  const handlePrintReceipt = (currency) => {
    setPrinting(`receipt_${currency}`);
    try {
      generateCantinaReceipt(saleSnapshot, {
        rates: { eur: rate?.eur, usd: rate?.usd },
        currency,
        businessInfo,
        payments,
      });
    } finally {
      setTimeout(() => setPrinting(null), 500);
    }
  };

  const handlePrintInvoice = async (currency) => {
    if (!hasFiscalData()) {
      setPendingCurrency(currency);
      setFiscalName((saleSnapshot.client_name || "").trim());
      setFiscalCedula((saleSnapshot.client_cedula || "").trim());
      setFiscalDataOpen(true);
      return;
    }
    await doPrintInvoice(currency);
  };

  const doPrintInvoice = async (currency, overrideName = null, overrideCedula = null) => {
    setPrinting(`invoice_${currency}`);
    try {
      const invoiceNumber = await ensureInvoiceNumber(supabase, saleSnapshot.id);
      const s = {
        ...saleSnapshot,
        invoice_number: invoiceNumber,
        client_name: overrideName ?? saleSnapshot.client_name,
        client_cedula: overrideCedula ?? saleSnapshot.client_cedula,
      };
      generateCantinaInvoice(s, {
        invoiceNumber,
        rates: { eur: rate?.eur, usd: rate?.usd },
        currency,
        businessInfo,
        payments,
      });
    } catch (err) {
      alert("Error generando factura: " + err.message);
    } finally {
      setTimeout(() => setPrinting(null), 500);
    }
  };

  const confirmFiscalAndPrint = async () => {
    const name = fiscalName.trim();
    const cedula = fiscalCedula.trim();
    if (!name) { alert("Nombre obligatorio para factura."); return; }
    if (!cedula) { alert("Cédula/RIF obligatorio para factura."); return; }
    setFiscalDataOpen(false);
    if (saleSnapshot?.id) {
      try {
        await supabase.from("cantina_sales").update({
          client_name: name,
          client_cedula: cedula,
        }).eq("id", saleSnapshot.id);
        setSaleSnapshot({ ...saleSnapshot, client_name: name, client_cedula: cedula });
      } catch (_) { /* no fatal */ }
    }
    await doPrintInvoice(pendingCurrency, name, cedula);
    setPendingCurrency(null);
  };

  const totalRef = Number(saleSnapshot.total_ref || 0);
  const ivaRef = Number(saleSnapshot.iva_amount_ref || 0);
  const subtotalRef = saleSnapshot.has_factura ? Math.max(0, totalRef - ivaRef) : totalRef;
  // En cantina, exchange_rate_bs es Bs/USD. Fallback a rate.usd, no rate.eur.
  const ratEur = Number(saleSnapshot.exchange_rate_bs || rate?.usd || 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-5 pt-5 pb-3 border-b border-stone-100 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-stone-800 flex items-center gap-1.5">
                <Receipt size={16} /> Venta {saleSnapshot.sale_number ? `#${saleSnapshot.sale_number}` : saleSnapshot.id?.slice(-6).toUpperCase()}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-500">
                <span className="flex items-center gap-1"><Clock size={10} /> {dateStr} · {time}</span>
                {saleSnapshot.has_factura && <span className="bg-brand/10 text-brand px-1.5 py-0.5 rounded font-medium">Con IVA</span>}
                {saleSnapshot.invoice_number && <span className="bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-mono">Fac #{String(saleSnapshot.invoice_number).padStart(6, "0")}</span>}
              </div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg">
              <X size={18} className="text-stone-400" />
            </button>
          </div>

          {/* Body scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {/* Cliente / Operador */}
            <div className="bg-stone-50 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 text-stone-600">
                <User size={11} className="text-stone-400 shrink-0" />
                <span>{saleSnapshot.client_name || "Sin cliente"}</span>
                {saleSnapshot.client_cedula && <span className="text-stone-400">· CI: {saleSnapshot.client_cedula}</span>}
              </div>
              {saleSnapshot.created_by && (
                <div className="text-stone-400 text-[11px]">Operador: {saleSnapshot.created_by}</div>
              )}
            </div>

            {/* Items */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-1.5">Items</p>
              <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 text-stone-500">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Producto</th>
                      <th className="text-center px-2 py-1.5 font-medium">Cant</th>
                      <th className="text-right px-3 py-1.5 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={3} className="text-center px-3 py-3 text-stone-400 text-xs">Sin items</td></tr>
                    ) : items.map((it, i) => {
                      const qty = Number(it.qty || it.quantity || 0);
                      const price = Number(it.price_per_unit || it.unit_price_ref || it.price_ref || it.price || 0);
                      return (
                        <tr key={i} className="border-t border-stone-100">
                          <td className="px-3 py-1.5 text-stone-700">{it.name}</td>
                          <td className="px-2 py-1.5 text-center">{qty}</td>
                          <td className="px-3 py-1.5 text-right font-medium">${(qty * price).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totales */}
            <div className="bg-white border border-stone-200 rounded-lg p-3 space-y-1 text-sm">
              {saleSnapshot.has_factura && (
                <>
                  <div className="flex justify-between text-xs text-stone-500">
                    <span>Subtotal</span>
                    <span>${subtotalRef.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-stone-500">
                    <span>IVA</span>
                    <span>${ivaRef.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold text-stone-800">
                <span>Total</span>
                <span className="text-brand">${totalRef.toFixed(2)}</span>
              </div>
              {ratEur > 0 && (
                <div className="flex justify-between text-[11px] text-stone-400">
                  <span>En Bs</span>
                  <span>{formatBs(totalRef, ratEur)}</span>
                </div>
              )}
            </div>

            {/* Pagos */}
            {payments.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-stone-500 font-bold mb-1.5">Pagos</p>
                <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      {payments.map((p, i) => (
                        <tr key={i} className="border-t border-stone-100 first:border-t-0">
                          <td className="px-3 py-1.5 text-stone-700">
                            {METHOD_LABELS[p.payment_method] || p.payment_method}
                            {p.reference && <span className="ml-1 text-stone-400">· ref {p.reference}</span>}
                            {p.is_change && <span className="ml-1 text-amber-600 text-[10px]">(vuelto)</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium">${Number(p.amount_ref).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer botones */}
          <div className="border-t border-stone-100 px-5 py-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePrintReceipt("bs")}
                disabled={printing === "receipt_bs"}
                className="py-2 rounded-lg border border-stone-200 text-stone-700 text-xs font-medium hover:bg-stone-50 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {printing === "receipt_bs" ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                Recibo Bs
              </button>
              <button
                onClick={() => handlePrintReceipt("usd")}
                disabled={printing === "receipt_usd"}
                className="py-2 rounded-lg border border-stone-200 text-stone-700 text-xs font-medium hover:bg-stone-50 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {printing === "receipt_usd" ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                Recibo $
              </button>
            </div>
            {saleSnapshot.has_factura && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePrintInvoice("bs")}
                  disabled={printing === "invoice_bs"}
                  className="py-2 rounded-lg border-2 border-brand/30 bg-brand/5 text-brand text-xs font-bold hover:bg-brand/10 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {printing === "invoice_bs" ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                  Factura Bs
                </button>
                <button
                  onClick={() => handlePrintInvoice("usd")}
                  disabled={printing === "invoice_usd"}
                  className="py-2 rounded-lg border-2 border-brand/30 bg-brand/5 text-brand text-xs font-bold hover:bg-brand/10 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {printing === "invoice_usd" ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                  Factura $
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal inline para captura de datos fiscales */}
      {fiscalDataOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setFiscalDataOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-stone-800 mb-1">Datos para factura</h3>
            <p className="text-xs text-stone-500 mb-4">
              Nombre y cédula/RIF son obligatorios para emitir factura formal.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Nombre / Razón social</label>
                <input
                  type="text"
                  value={fiscalName}
                  onChange={(e) => setFiscalName(e.target.value)}
                  placeholder="Nombre completo o razón social"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Cédula / RIF</label>
                <input
                  type="text"
                  value={fiscalCedula}
                  onChange={(e) => setFiscalCedula(e.target.value)}
                  placeholder="V-12345678 o J-12345678-9"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setFiscalDataOpen(false); setPendingCurrency(null); }}
                className="flex-1 py-2.5 rounded-lg border-2 border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50"
              >Cancelar</button>
              <button
                onClick={confirmFiscalAndPrint}
                disabled={!fiscalName.trim() || !fiscalCedula.trim()}
                className="flex-1 py-2.5 rounded-lg bg-brand text-white font-bold text-sm hover:bg-brand-dark disabled:opacity-30"
              >Generar factura</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
