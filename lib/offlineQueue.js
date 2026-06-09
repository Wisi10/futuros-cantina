"use client";
// ============================================================================
// Cola offline de ventas — IndexedDB
// ============================================================================
// Cuando no hay internet, las ventas se guardan acá con todo lo necesario
// para sync después. Estado: pending → syncing → synced (o failed).
// ============================================================================

const DB_NAME = "futuros_cantina_offline";
const DB_VERSION = 1;
const STORE_SALES = "pending_sales";

let dbPromise = null;

function openDB() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        const store = db.createObjectStore(STORE_SALES, { keyPath: "local_id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => {
    if (!db) throw new Error("IndexedDB no disponible");
    return db.transaction(storeName, mode).objectStore(storeName);
  });
}

// Genera un ID local único para venta offline (se reemplaza con server ID al sync)
export function generateLocalSaleId() {
  return "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

// Enqueue una venta pendiente. saleData es el payload completo que se va a
// enviar al sync (incluye sale header + payments + items + opciones).
export async function enqueueSale(saleData) {
  const store = await tx(STORE_SALES, "readwrite");
  const record = {
    local_id: saleData.local_id || generateLocalSaleId(),
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    last_error: null,
    last_attempt_at: null,
    server_id: null,
    server_sale_number: null,
    data: saleData,
  };
  return new Promise((resolve, reject) => {
    const req = store.add(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingSales() {
  const store = await tx(STORE_SALES, "readonly");
  return new Promise((resolve, reject) => {
    const results = [];
    const req = store.openCursor();
    req.onerror = () => reject(req.error);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.value.status === "pending" || cursor.value.status === "failed") {
          results.push(cursor.value);
        }
        cursor.continue();
      } else {
        // Ordenar por created_at ASC para sync en orden cronológico
        results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        resolve(results);
      }
    };
  });
}

export async function getAllSalesIncludingSynced() {
  const store = await tx(STORE_SALES, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || []);
  });
}

export async function countPending() {
  const sales = await getPendingSales();
  return sales.length;
}

export async function markSyncing(localId) {
  return updateRecord(localId, (r) => ({
    ...r,
    status: "syncing",
    last_attempt_at: new Date().toISOString(),
    attempts: (r.attempts || 0) + 1,
  }));
}

export async function markSynced(localId, serverId, serverSaleNumber) {
  return updateRecord(localId, (r) => ({
    ...r,
    status: "synced",
    server_id: serverId,
    server_sale_number: serverSaleNumber,
    synced_at: new Date().toISOString(),
  }));
}

export async function markFailed(localId, errorMessage) {
  return updateRecord(localId, (r) => ({
    ...r,
    status: "failed",
    last_error: errorMessage,
  }));
}

async function updateRecord(localId, updater) {
  const store = await tx(STORE_SALES, "readwrite");
  return new Promise((resolve, reject) => {
    const getReq = store.get(localId);
    getReq.onerror = () => reject(getReq.error);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) { resolve(null); return; }
      const updated = updater(existing);
      const putReq = store.put(updated);
      putReq.onerror = () => reject(putReq.error);
      putReq.onsuccess = () => resolve(updated);
    };
  });
}

// Limpiar ventas synced más viejas que N días (mantenimiento)
export async function cleanupOldSynced(daysOld = 7) {
  const store = await tx(STORE_SALES, "readwrite");
  const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  return new Promise((resolve, reject) => {
    let deleted = 0;
    const req = store.openCursor();
    req.onerror = () => reject(req.error);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const r = cursor.value;
        if (r.status === "synced" && r.synced_at && new Date(r.synced_at).getTime() < cutoff) {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      } else {
        resolve(deleted);
      }
    };
  });
}
