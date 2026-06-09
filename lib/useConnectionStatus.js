"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { countPending } from "@/lib/offlineQueue";

// Hook que detecta el estado real de conexión a Supabase y cuenta ventas en cola.
// Pinga cada PING_INTERVAL_MS. 3 fallos seguidos → offline. 1 éxito → online.
//
// Retorna: { isOnline, isChecking, pendingCount, refreshPending, forceCheck }
const PING_INTERVAL_MS = 15 * 1000; // 15s entre pings (no abusar)
const PING_TIMEOUT_MS = 5 * 1000;   // 5s timeout por ping
const FAILS_TO_GO_OFFLINE = 3;

export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const failCountRef = useRef(0);
  const intervalRef = useRef(null);

  const refreshPending = useCallback(async () => {
    try {
      const n = await countPending();
      setPendingCount(n);
    } catch (_) { /* IndexedDB no disponible, ignorar */ }
  }, []);

  const pingSupabase = useCallback(async () => {
    if (typeof window === "undefined") return true;
    if (!navigator.onLine) {
      failCountRef.current = FAILS_TO_GO_OFFLINE;
      setIsOnline(false);
      return false;
    }
    setIsChecking(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      // Ping liviano: head request a Supabase REST con limit 0
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabase?.supabaseUrl;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabase?.supabaseKey;
      if (!url || !key) throw new Error("Sin credenciales Supabase");
      const res = await fetch(url + "/rest/v1/products?select=id&limit=1", {
        signal: controller.signal,
        headers: { apikey: key, Authorization: "Bearer " + key },
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        failCountRef.current = 0;
        setIsOnline(true);
        return true;
      }
      throw new Error("HTTP " + res.status);
    } catch (_) {
      failCountRef.current += 1;
      if (failCountRef.current >= FAILS_TO_GO_OFFLINE) {
        setIsOnline(false);
      }
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Init + interval
  useEffect(() => {
    pingSupabase();
    refreshPending();
    intervalRef.current = setInterval(() => {
      pingSupabase();
      refreshPending();
    }, PING_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [pingSupabase, refreshPending]);

  // Browser online/offline events
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => { failCountRef.current = 0; pingSupabase(); };
    const handleOffline = () => { failCountRef.current = FAILS_TO_GO_OFFLINE; setIsOnline(false); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [pingSupabase]);

  return {
    isOnline,
    isChecking,
    pendingCount,
    refreshPending,
    forceCheck: pingSupabase,
  };
}
