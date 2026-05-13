"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { X, Search, ArrowLeft, User, Gift, Percent, UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatREF, formatBs, generateId, ProductImage } from "@/lib/utils";

export default function ClientModal({ rate, user, onClose, onAssociateClient, initialClientId }) {
  const isAdmin = user?.cantinaRole === "gerente" || user?.cantinaRole === "owner" || user?.cantinaRole === "admin";
  const [availableDiscounts, setAvailableDiscounts] = useState([]);
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [savingDiscount, setSavingDiscount] = useState(false);

  // Crear cliente nuevo (inline desde el search)
  const [createForm, setCreateForm] = useState({ first_name: "", last_name: "", phone: "", cedula: "", email: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const creatingRef = useRef(false);

  // Cargar descuentos cantina disponibles (una vez)
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("discounts")
      .select("id, name, percentage")
      .eq("is_cantina", true)
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setAvailableDiscounts(data || []));
  }, []);
  const [view, setView] = useState("list"); // "list" | "profile" | "rewards" | "redeemSuccess" | "create"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [rewards, setRewards] = useState([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [redeeming, setRedeeming] = useState(null);
  const [lastRedeemed, setLastRedeemed] = useState(null);
  const timerRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!supabase || !q || q.length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    try {
      const { data } = await supabase.rpc("search_clients", { query: q });
      setSearchResults(data || []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!searchQuery || searchQuery.length < 2) { setSearchResults([]); return; }
    timerRef.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [searchQuery, doSearch]);

  const openProfile = useCallback(async (clientId) => {
    if (!clientId || !supabase) return;
    setLoadingProfile(true);
    setView("profile");
    try {
      const { data } = await supabase.rpc("get_client_profile", { client_id_param: clientId });
      setProfile(data?.[0] || null);
    } catch { setProfile(null); }
    setLoadingProfile(false);
  }, []);

  // Auto-open profile if initialClientId provided
  useEffect(() => {
    if (initialClientId) openProfile(initialClientId);
  }, [initialClientId, openProfile]);

  const openRewards = async () => {
    if (!profile?.id || !supabase) return;
    setLoadingRewards(true);
    setView("rewards");
    try {
      const { data } = await supabase.rpc("get_redeemable_products", { client_id_param: profile.id });
      setRewards(data || []);
    } catch { setRewards([]); }
    setLoadingRewards(false);
  };

  const handleRedeem = async (product) => {
    if (!profile?.id || !supabase || redeeming) return;
    setRedeeming(product.id);
    try {
      const { data } = await supabase.rpc("redeem_loyalty_reward", {
        client_id_param: profile.id,
        product_id_param: product.id,
        sale_id_param: null,
        redeemed_by_param: user?.name || "Staff",
      });
      const result = data?.[0];
      if (result?.success) {
        setLastRedeemed({ name: product.name, points: product.redemption_cost_points });
        setView("redeemSuccess");
        // Refresh profile
        const { data: refreshed } = await supabase.rpc("get_client_profile", { client_id_param: profile.id });
        if (refreshed?.[0]) setProfile(refreshed[0]);
      } else {
        alert(result?.message || "Error canjeando premio");
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setRedeeming(null);
  };

  const goBack = () => {
    if (view === "redeemSuccess" || view === "rewards") { setView("profile"); setLastRedeemed(null); }
    else if (view === "create") {
      setView("list");
      setCreateForm({ first_name: "", last_name: "", phone: "", cedula: "", email: "" });
      setCreateError("");
    }
    else { setView("list"); setProfile(null); }
  };

  const openCreate = () => {
    const q = searchQuery.trim();
    const parts = q.split(/\s+/);
    const looksLikeCedula = /^\d{5,}$/.test(q);
    const looksLikePhone = /^[+\d][\d\s-]{6,}$/.test(q);
    setCreateForm({
      first_name: looksLikeCedula || looksLikePhone ? "" : (parts[0] || ""),
      last_name: looksLikeCedula || looksLikePhone ? "" : (parts.slice(1).join(" ") || ""),
      phone: looksLikePhone ? q : "",
      cedula: looksLikeCedula ? q : "",
      email: "",
    });
    setCreateError("");
    setView("create");
  };

  const handleCreate = async () => {
    if (creatingRef.current || !supabase) return;
    const first = createForm.first_name.trim();
    const last = createForm.last_name.trim();
    const phone = createForm.phone.trim();
    const cedula = createForm.cedula.trim();
    const email = createForm.email.trim();

    if (!first || !last) {
      setCreateError("Nombre y apellido son obligatorios");
      return;
    }
    // Teléfono: solo dígitos, espacios, +, -. Permitir vacío.
    if (phone && !/^[+]?[\d\s-]{6,20}$/.test(phone)) {
      setCreateError("Teléfono inválido. Usa solo números, espacios, + o -.");
      return;
    }
    // Cédula venezolana: V/E/J + dígitos, o solo dígitos. Permitir vacío.
    if (cedula && !/^[VEJvej]?-?\d{5,12}$/.test(cedula.replace(/\s/g, ""))) {
      setCreateError("Cédula inválida. Formato esperado: V-12345678 o solo dígitos.");
      return;
    }
    // Email básico. Permitir vacío.
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCreateError("Email inválido.");
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setCreateError("");
    const newId = generateId();
    const { error } = await supabase.from("clients").insert({
      id: newId,
      first_name: first,
      last_name: last,
      phone: phone || null,
      cedula: cedula || null,
      email: email || null,
    });
    creatingRef.current = false;
    setCreating(false);
    if (error) {
      setCreateError(error.message || "Error creando cliente");
      return;
    }
    // Auto-asociar a la venta y cerrar
    if (onAssociateClient) {
      onAssociateClient({
        id: newId,
        name: `${first} ${last}`,
        cedula: cedula || null,
        points: 0,
        discount: null,
      });
      onClose();
    } else {
      // Sin asociacion: abrir perfil del cliente recien creado
      openProfile(newId);
      setSearchQuery("");
      setCreateForm({ first_name: "", last_name: "", phone: "", cedula: "", email: "" });
    }
  };

  const fmtHour = (h) => {
    const hour = Number(h || 0);
    if (hour === 0) return "12am";
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return "12pm";
    return `${hour - 12}pm`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          {view !== "list" ? (
            <button onClick={goBack} className="flex items-center gap-1 text-sm text-brand font-medium hover:underline">
              <ArrowLeft size={16} /> Volver
            </button>
          ) : (
            <h2 className="text-base font-bold text-stone-800 flex items-center gap-2"><User size={18} /> Cliente</h2>
          )}
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-lg"><X size={18} className="text-stone-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">

          {/* ═══ VIEW: LIST ═══ */}
          {view === "list" && (
            <>
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, cedula, telefono..."
                  className="w-full border border-stone-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:border-brand focus:outline-none" autoFocus />
              </div>

              {searching && <p className="text-xs text-stone-400 animate-pulse text-center py-2">Buscando...</p>}
              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="text-center py-3">
                  <p className="text-xs text-stone-400 mb-2">Sin resultados para "{searchQuery}"</p>
                  <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-xl text-xs font-medium hover:bg-brand-dark transition-colors"
                  >
                    <UserPlus size={14} /> Crear nuevo cliente
                  </button>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="space-y-1">
                  {searchResults.map(c => (
                    <button key={c.id} onClick={() => openProfile(c.id)}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-stone-200 hover:border-brand hover:bg-stone-50 transition-colors">
                      <p className="text-sm font-medium text-stone-800">{c.full_name || "?"}</p>
                      {c.cedula && <p className="text-[11px] text-stone-400">CI: {c.cedula}</p>}
                    </button>
                  ))}
                </div>
              )}

              {/* Crear cliente nuevo — siempre visible cuando hay query corta o sin resultados aun */}
              {(searchQuery.length < 2 || searchResults.length > 0) && (
                <div className="mt-3 pt-3 border-t border-stone-100">
                  <button
                    onClick={openCreate}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 border-2 border-dashed border-stone-300 hover:border-brand rounded-xl text-xs font-medium text-stone-500 hover:text-brand transition-colors"
                  >
                    <UserPlus size={14} /> Crear nuevo cliente
                  </button>
                </div>
              )}
            </>
          )}

          {/* ═══ VIEW: CREATE ═══ */}
          {view === "create" && (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium">Nuevo cliente</p>

              <div>
                <label className="text-[11px] text-stone-500 block mb-1">Nombre *</label>
                <input
                  type="text"
                  value={createForm.first_name}
                  onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                  placeholder="María"
                  autoFocus
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-stone-500 block mb-1">Apellido *</label>
                <input
                  type="text"
                  value={createForm.last_name}
                  onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                  placeholder="González"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-stone-500 block mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="+58 412 1234567"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-stone-500 block mb-1">Cédula</label>
                <input
                  type="text"
                  value={createForm.cedula}
                  onChange={(e) => setCreateForm({ ...createForm, cedula: e.target.value })}
                  placeholder="V-12345678"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-stone-500 block mb-1">Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="cliente@ejemplo.com"
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>

              {createError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                  {createError}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={creating || !createForm.first_name.trim() || !createForm.last_name.trim()}
                className="w-full py-2.5 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-dark disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {creating ? <><Loader2 size={14} className="animate-spin" /> Creando...</> : (onAssociateClient ? "Crear y asociar a venta" : "Crear cliente")}
              </button>
            </div>
          )}

          {/* ═══ VIEW: PROFILE ═══ */}
          {view === "profile" && (
            <>
              {loadingProfile ? (
                <p className="text-xs text-stone-400 animate-pulse py-8 text-center">Cargando perfil...</p>
              ) : !profile ? (
                <p className="text-xs text-stone-400 text-center py-8">Cliente no encontrado</p>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-2">
                    <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-2">
                      <User size={24} className="text-brand" />
                    </div>
                    <h3 className="text-lg font-bold text-stone-800">{profile.full_name || "?"}</h3>
                    <p className="text-xs text-stone-400 mt-0.5">{profile.cedula ? `CI: ${profile.cedula}` : "Sin cedula registrada"}</p>
                  </div>

                  {/* Loyalty points */}
                  <div className="bg-gold/5 border border-gold/20 rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-[1.5px] text-gold font-medium mb-1">Puntos de lealtad</p>
                    <p className="text-2xl font-bold text-gold">{Number(profile.loyalty_points || 0).toLocaleString()} pts</p>
                    {Number(profile.loyalty_points || 0) > 0 && (
                      <button onClick={openRewards}
                        className="mt-2 px-4 py-2 bg-gold text-white rounded-lg text-xs font-medium hover:bg-gold-hover transition-colors flex items-center gap-1.5">
                        <Gift size={14} /> Canjear premio
                      </button>
                    )}
                  </div>

                  {/* Descuento cantina */}
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[1.5px] text-stone-500 font-medium flex items-center gap-1">
                        <Percent size={11} /> Descuento cantina
                      </p>
                      {isAdmin && !editingDiscount && (
                        <button
                          onClick={() => setEditingDiscount(true)}
                          className="text-[11px] text-brand hover:underline"
                        >
                          {profile.cantina_discount_id ? "Cambiar" : "Asignar"}
                        </button>
                      )}
                    </div>
                    {editingDiscount ? (
                      <div className="mt-2 space-y-2">
                        <select
                          value={profile.cantina_discount_id || ""}
                          onChange={async (e) => {
                            const newId = e.target.value || null;
                            setSavingDiscount(true);
                            const { error } = await supabase
                              .from("clients")
                              .update({ cantina_discount_id: newId })
                              .eq("id", profile.id);
                            setSavingDiscount(false);
                            if (error) { alert("Error: " + error.message); return; }
                            const { data: refreshed } = await supabase.rpc("get_client_profile", { client_id_param: profile.id });
                            if (refreshed?.[0]) setProfile(refreshed[0]);
                            setEditingDiscount(false);
                          }}
                          disabled={savingDiscount}
                          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm focus:border-brand focus:outline-none bg-white"
                        >
                          <option value="">Sin descuento</option>
                          {availableDiscounts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({Number(d.percentage).toFixed(d.percentage % 1 === 0 ? 0 : 2)}%)
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setEditingDiscount(false)}
                          className="text-[11px] text-stone-500 hover:underline"
                          disabled={savingDiscount}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : profile.cantina_discount_id ? (
                      <p className="text-sm font-bold text-brand mt-1">
                        {profile.cantina_discount_name} · {Number(profile.cantina_discount_pct || 0).toFixed(profile.cantina_discount_pct % 1 === 0 ? 0 : 2)}%
                      </p>
                    ) : (
                      <p className="text-xs text-stone-400 mt-1">Sin descuento asignado</p>
                    )}
                  </div>

                  {/* Associate to sale */}
                  {onAssociateClient && (
                    <button onClick={() => {
                      onAssociateClient({
                        id: profile.id,
                        name: profile.full_name,
                        cedula: profile.cedula || null,
                        points: Number(profile.loyalty_points || 0),
                        discount: profile.cantina_discount_id ? {
                          id: profile.cantina_discount_id,
                          name: profile.cantina_discount_name,
                          pct: Number(profile.cantina_discount_pct || 0),
                        } : null,
                      });
                      onClose();
                    }}
                      className="w-full py-2.5 border-2 border-brand rounded-xl text-sm font-medium text-brand hover:bg-brand/5 transition-colors">
                      Asociar a venta actual
                    </button>
                  )}

                  {/* Credits */}
                  {Number(profile.pending_credits_count || 0) > 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <p className="text-[10px] uppercase tracking-[1.5px] text-yellow-700 font-medium mb-2">Creditos pendientes</p>
                      <p className="text-xl font-bold text-yellow-700">{formatREF(Number(profile.pending_credits_ref || 0))}</p>
                      {rate?.eur && <p className="text-xs text-yellow-600 mt-0.5">{formatBs(Number(profile.pending_credits_ref || 0), rate.eur)}</p>}
                      <p className="text-xs text-yellow-600 mt-1">{profile.pending_credits_count} credito{profile.pending_credits_count !== 1 ? "s" : ""} abierto{profile.pending_credits_count !== 1 ? "s" : ""}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 text-center">Sin creditos pendientes</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ═══ VIEW: REWARDS ═══ */}
          {view === "rewards" && (
            <>
              <p className="text-[10px] uppercase tracking-[1.5px] text-stone-400 font-medium mb-1">Premios disponibles</p>
              <p className="text-xs text-stone-400 mb-3">Saldo: <span className="font-medium text-gold">{Number(profile?.loyalty_points || 0).toLocaleString()} pts</span></p>

              {loadingRewards ? (
                <p className="text-xs text-stone-400 animate-pulse py-8 text-center">Cargando premios...</p>
              ) : rewards.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-8">Sin premios disponibles con tu saldo actual</p>
              ) : (
                <div className="space-y-2">
                  {rewards.map(r => (
                    <div key={r.id} className="flex items-center gap-3 p-3 border border-stone-200 rounded-xl">
                      <ProductImage product={r} size={40} className="rounded-lg" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{r.name}</p>
                        <p className="text-xs text-gold font-medium">{r.redemption_cost_points} pts</p>
                        <p className="text-[10px] text-stone-400">Stock: {r.current_stock}</p>
                      </div>
                      <button onClick={() => handleRedeem(r)} disabled={!!redeeming}
                        className="px-3 py-1.5 bg-gold text-white rounded-lg text-xs font-medium hover:bg-gold-hover disabled:opacity-50 transition-colors shrink-0">
                        {redeeming === r.id ? "..." : "Canjear"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ═══ VIEW: REDEEM SUCCESS ═══ */}
          {view === "redeemSuccess" && lastRedeemed && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🎁</div>
              <h3 className="text-lg font-bold text-stone-800 mb-1">Premio canjeado!</h3>
              <p className="text-sm text-stone-600 mb-1">{lastRedeemed.name}</p>
              <p className="text-xs text-gold font-medium">-{lastRedeemed.points} puntos</p>
              <p className="text-xs text-stone-400 mt-3">Saldo restante: <span className="font-medium">{Number(profile?.loyalty_points || 0).toLocaleString()} pts</span></p>
              <button onClick={goBack} className="mt-4 px-6 py-2.5 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-dark transition-colors">
                Volver al perfil
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
