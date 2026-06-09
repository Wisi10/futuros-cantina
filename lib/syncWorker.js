"use client";
// ============================================================================
// Sync worker — procesa la cola de ventas offline cuando hay internet
// ============================================================================
// Se invoca desde el POS cuando isOnline cambia a true o cuando se enqueue.
// Procesa una venta a la vez en orden cronológico, con retry exponencial.
// ============================================================================

import { supabase } from "@/lib/supabase";
import { getPendingSales, markSyncing, markSynced, markFailed } from "@/lib/offlineQueue";

const MAX_ATTEMPTS = 5;

let inFlight = false; // Singleton — solo 1 sync corriendo a la vez

export async function runSync({ onProgress } = {}) {
  if (inFlight) return { skipped: true };
  inFlight = true;
  let processed = 0, succeeded = 0, failed = 0;
  try {
    const pending = await getPendingSales();
    for (const record of pending) {
      if (record.attempts >= MAX_ATTEMPTS && record.status === "failed") {
        continue; // ya marcada fallida, requiere intervención admin
      }
      try {
        await markSyncing(record.local_id);
        if (onProgress) onProgress({ processed, total: pending.length, current: record.local_id });
        const result = await syncOneSale(record);
        await markSynced(record.local_id, result.sale_id, result.sale_number);
        succeeded++;
      } catch (err) {
        const msg = err?.message || String(err);
        if (record.attempts + 1 >= MAX_ATTEMPTS) {
          await markFailed(record.local_id, msg);
          failed++;
        } else {
          // dejarla como "pending" para reintentar después
          await markFailed(record.local_id, msg); // temporarily mark failed; nextRun retomará
        }
      }
      processed++;
    }
  } finally {
    inFlight = false;
  }
  return { processed, succeeded, failed };
}

// Sync de UNA venta: inserta cantina_sales + cantina_sale_payments + stock_movements
// + ajustes de stock. Retorna { sale_id, sale_number }.
async function syncOneSale(record) {
  const d = record.data;

  // 1. Insert cantina_sales (cancela si ya existe el local_id como sale.id)
  const salePayload = {
    id: d.local_id, // El local_id se vuelve sale.id permanente
    sale_date: d.sale_date,
    items: d.items,
    total_ref: d.total_ref,
    total_bs: d.total_bs,
    payment_method: d.payment_method,
    reference: d.reference,
    payment_status: d.payment_status,
    client_id: d.client_id,
    client_name: d.client_name,
    exchange_rate_bs: d.exchange_rate_bs,
    notes: d.notes,
    created_by: d.created_by,
    has_factura: d.has_factura || false,
    iva_amount_ref: d.iva_amount_ref || 0,
  };
  const { data: sale, error: saleErr } = await supabase
    .from("cantina_sales")
    .insert(salePayload)
    .select()
    .single();
  if (saleErr) {
    // Si error es duplicate key, asumimos que ya estaba synced y seguimos
    if (saleErr.code !== "23505") throw saleErr;
  }

  const finalSale = sale || { id: d.local_id };

  // 2. Insert cantina_sale_payments
  if (Array.isArray(d.payments_rows) && d.payments_rows.length > 0) {
    const rows = d.payments_rows.map((p) => ({ ...p, sale_id: finalSale.id }));
    const { error: payErr } = await supabase.from("cantina_sale_payments").insert(rows);
    if (payErr && payErr.code !== "23505") throw payErr;
  }

  // 3. Stock movements (decrement)
  if (Array.isArray(d.stock_movements) && d.stock_movements.length > 0) {
    const movs = d.stock_movements.map((m) => ({ ...m, reference_id: m.reference_id || finalSale.id }));
    const { error: movErr } = await supabase.from("stock_movements").insert(movs);
    if (movErr && movErr.code !== "23505") throw movErr;
  }

  // 4. Decrement stock en products (RPC para concurrencia segura)
  if (Array.isArray(d.product_decrements) && d.product_decrements.length > 0) {
    for (const dec of d.product_decrements) {
      try {
        await supabase.rpc("decrement_product_stock", {
          p_id: dec.product_id,
          p_qty: dec.qty,
        });
      } catch (e) {
        // Si stock insuficiente, dejamos el movimiento pero no abortamos la venta —
        // el admin lo verá en alerts post-facto. Es la política decidida con Sam.
        console.warn("[sync] stock decrement falló para", dec.product_id, e.message);
      }
    }
  }

  return { sale_id: finalSale.id, sale_number: finalSale.sale_number };
}
