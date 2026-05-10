"use client";
import { createContext, useContext, useState, useCallback } from "react";

const ClientProfileCtx = createContext({ open: () => {} });

export function ClientProfileProvider({ children }) {
  const [profileId, setProfileId] = useState(null);
  const open = useCallback((id) => {
    if (id) setProfileId(id);
  }, []);
  const close = useCallback(() => setProfileId(null), []);
  return (
    <ClientProfileCtx.Provider value={{ open, close, profileId }}>
      {children}
    </ClientProfileCtx.Provider>
  );
}

export function useClientProfile() {
  return useContext(ClientProfileCtx);
}
