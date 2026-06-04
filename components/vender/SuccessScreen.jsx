"use client";
import { useState, useEffect } from "react";
import { CheckCircle, RotateCcw, Printer, FileText, Loader2 } from "lucide-react";
import { formatBs, METHOD_LABELS } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { generateCantinaReceipt, generateCantinaInvoice, ensureInvoiceNumber, loadInvoiceBusinessInfo } from "@/lib/cantinaPrint";

const VOID_WINDOW_MS = 5 * 60 * 1000;

export default function SuccessScreen({ sale, saleRecord, rate, todayStats, onNewSale, onVoidSale, canVoid, saleTimestamp }) {
  const [printing, setPrinting] = useState(null); // 'receipt_bs' | 'receipt_usd' | 'invoice_bs' | 'invoice_usd'
  const [businessInfo, setBusinessInfo] = useState(null);

  useEffect(() => {
    loadInvoiceBusinessInfo(supabase).then(setBusinessInfo).catch(() => {});
  }, []);

  // Construye un sale object normalizado (DB-like) desde el record + summary actual
  const buildSaleForPrint = () => {
    if (!saleRecord) {
      // Fallback: usar el summary del state lastSale
      return {
        id: null,
        sale_number: sale.saleNumber,
        sale_date: new Date().toISOString().split("T")[0],
        client_name: sale.creditClientName || null,
        items: sale.items.map((it) => ({
          name: it.name,
          qty: it.qty,
          price_per_unit: it.price_ref,
        })),
        total_ref: sale.subtotalRef ?? sale.totalRef,
        iva_amount_ref: sale.ivaAmountRef ?? 0,
        has_factura: !!sale.hasFactura,
        payment_method: sale.paymentMethod,
        exchange_rate_bs: rate?.eur || null,
        created_at: new Date().toISOString(),
      };
    }
    return saleRecord;
  };

  const handlePrintReceipt = (currency) => {
    setPrinting(`receipt_${currency}`);
    try {
      const s = buildSaleForPrint();
      generateCantinaReceipt(s, {
        rates: { eur: rate?.eur, usd: rate?.usd },
        currency,
        businessInfo,
        payments: sale.payments || null,
      });
    } finally {
      setTimeout(() => setPrinting(null), 500);
    }
  };

  const handlePrintInvoice = async (currency) => {
    if (!saleRecord?.id) {
      alert("No se puede generar factura: venta sin ID en DB.");
      return;
    }
    setPrinting(`invoice_${currency}`);
    try {
      const invoiceNumber = await ensureInvoiceNumber(supabase, saleRecord.id);
      const s = { ...buildSaleForPrint(), invoice_number: invoiceNumber };
      generateCantinaInvoice(s, {
        invoiceNumber,
        rates: { eur: rate?.eur, usd: rate?.usd },
        currency,
        businessInfo,
        payments: sale.payments || null,
      });
    } catch (err) {
      alert("Error generando factura: " + err.message);
    } finally {
      setTimeout(() => setPrinting(null), 500);
    }
  };

  // Countdown del tiempo restante para anular
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!canVoid || !saleTimestamp) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [canVoid, saleTimestamp]);

  const remainingMs = saleTimestamp ? Math.max(0, VOID_WINDOW_MS - (now - saleTimestamp)) : 0;
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const voidStillActive = canVoid && remainingMs > 0;

  return (
    <div className="fixed inset-0 bg-brand-cream-light z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-sm w-full text-center">
        <CheckCircle size={56} className="text-green-500 mx-auto mb-4" strokeWidth={1.5} />

        <h2 className="text-xl font-bold text-stone-800 mb-1">
          {sale.paymentMethod === "credit" ? "Credito registrado!" : "Venta registrada!"}
        </h2>
        {sale.saleNumber != null && (
          <p className="text-[11px] uppercase tracking-wider text-stone-500 font-bold mb-1">
            Venta <span className="font-mono text-brand text-sm">#{sale.saleNumber}</span>
          </p>
        )}
        <p className="text-sm text-stone-400 mb-5">
          {sale.paymentMethod === "credit"
            ? `Credito para ${sale.creditClientName}`
            : "Stock actualizado automaticamente"}
        </p>

        <div className="bg-stone-50 rounded-xl p-4 mb-4 text-left">
          <div className="space-y-1 mb-3">
            {sale.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-stone-600">{item.qty}x {item.name}</span>
                <span className="font-medium">${(item.price_ref * item.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-stone-200 pt-2 space-y-1">
            {sale.hasFactura && (
              <>
                <div className="flex justify-between text-xs text-stone-500">
                  <span>Subtotal</span>
                  <span>${Number(sale.subtotalRef || 0).toFixed(2)}</span>
                </div>
                {Number(sale.ivaAmountRef || 0) > 0 && (
                  <div className="flex justify-between text-xs text-stone-500">
                    <span>IVA</span>
                    <span>${Number(sale.ivaAmountRef).toFixed(2)}</span>
                  </div>
                )}
                {Number(sale.igtfAmountRef || 0) > 0 && (
                  <div className="flex justify-between text-xs text-stone-500">
                    <span>IGTF</span>
                    <span>${Number(sale.igtfAmountRef).toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-stone-500">Total</span>
              <span className="font-bold text-brand">${sale.totalRef.toFixed(2)}</span>
            </div>
            {sale.rate != null && sale.rate > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-stone-500"></span>
                <span className="text-sm text-stone-400">
                  {formatBs(sale.totalRef, sale.rate)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-stone-500">Método</span>
              <span className="text-sm font-medium">{METHOD_LABELS[sale.paymentMethod] || sale.paymentMethod}</span>
            </div>
            {sale.reference && (
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Referencia</span>
                <span className="text-sm font-medium font-mono text-stone-700">{sale.reference}</span>
              </div>
            )}
          </div>
        </div>

        {todayStats.count > 1 && (
          <div className="bg-brand/5 rounded-xl p-3 mb-4">
            <p className="text-xs text-brand font-medium">
              Total del dia: ${todayStats.total.toFixed(2)} en {todayStats.count} ventas
            </p>
          </div>
        )}

        {/* Botones de impresión: Recibo siempre, Factura solo si hasFactura */}
        <div className="mb-3 space-y-2">
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
          {sale.hasFactura && (
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

        <button
          onClick={onNewSale}
          className="w-full py-4 rounded-xl bg-brand text-white font-bold text-base hover:bg-brand-dark active:scale-[0.98] transition-all"
        >
          Nueva Venta
        </button>

        {voidStillActive && onVoidSale ? (
          <button
            onClick={onVoidSale}
            className="w-full mt-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw size={14} /> Anular esta venta — {remainingMin}:{String(remainingSec).padStart(2, '0')}
          </button>
        ) : canVoid === false && saleTimestamp && (
          <p className="w-full mt-2 py-3 text-center text-xs text-stone-400 italic">
            Ventana de anulación cerrada (pasaron 5 min)
          </p>
        )}
      </div>
    </div>
  );
}
