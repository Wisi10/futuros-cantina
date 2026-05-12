"use client";
import { useState, useEffect, useCallback } from "react";
import { Shield, Users, Eye, Lightbulb, Check, X, Loader2, Power, AlertTriangle, Gift, Key } from "lucide-react";
import { supabase } from "@/lib/supabase";

const TABS = [
  { id: "permisos", label: "Permisos", icon: Users },
  { id: "sistema", label: "Sistema", icon: Power },
  { id: "verComo", label: "Ver como", icon: Eye },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
];

export default function AdminView({ user, onImpersonate, impersonatedRole }) {
  const [tab, setTab] = useState("permisos");
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [killswitchSales, setKillswitchSales] = useState({ enabled: false, message: "" });
  const [killswitchSalesLoading, setKillswitchSalesLoading] = useState(false);
  const [resetPinFor, setResetPinFor] = useState(null);
  const [newPin, setNewPin] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [profilesRes, killRes] = await Promise.all([
      supabase.from("user_profiles").select("id, name, role, cantina_role, is_active, pin, phone, cortesia_limit_monthly_ref").order("name"),
      supabase.from("app_settings").select("value").eq("key", "killswitch_cantina_sales").maybeSingle(),
    ]);
    setProfiles(profilesRes.data || []);
    if (killRes.data?.value) setKillswitchSales(killRes.data.value);
    setLoading(false);
  }, []);

  const saveKillswitchSales = async (patch) => {
    setKillswitchSalesLoading(true);
    const next = { ...killswitchSales, ...patch };
    setKillswitchSales(next);
    const { error } = await supabase.from("app_settings").upsert({
      key: "killswitch_cantina_sales",
      value: next,
      updated_by: user?.name || "Owner",
    }, { onConflict: "key" });
    setKillswitchSalesLoading(false);
    if (error) alert("Error: " + error.message);
  };

  const handleResetPin = async () => {
    if (!resetPinFor || !newPin.trim()) return;
    if (!/^\d{4,8}$/.test(newPin)) { alert("PIN debe ser 4-8 digitos"); return; }
    const { error } = await supabase.from("user_profiles").update({ pin: newPin }).eq("id", resetPinFor.id);
    if (error) { alert("Error: " + error.message); return; }
    setResetPinFor(null); setNewPin("");
    alert(`PIN actualizado para ${resetPinFor.name}`);
    await load();
  };

  const setCortesiaLimit = async (profileId, val) => {
    const num = val === "" ? null : Number(val);
    if (val !== "" && (!Number.isFinite(num) || num < 0)) return;
    const { error } = await supabase.from("user_profiles").update({ cortesia_limit_monthly_ref: num }).eq("id", profileId);
    if (error) alert("Error: " + error.message);
    await load();
  };

  useEffect(() => { load(); }, [load]);

  const setCantinaRole = async (profileId, newRole) => {
    setSavingId(profileId);
    const { error } = await supabase
      .from("user_profiles")
      .update({ cantina_role: newRole })
      .eq("id", profileId);
    setSavingId(null);
    if (error) { alert("Error: " + error.message); return; }
    await load();
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <h1 className="font-bold text-brand text-lg flex items-center gap-2 mb-4">
        <Shield size={20} /> Administracion
      </h1>

      <div className="flex gap-1 mb-4 border-b border-stone-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1.5 ${
                active ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              <Icon size={12} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "permisos" && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <b>Admin</b> ve todo (Caja, Reportes, Costos, Config, Clientes, Puntos). <b>Staff</b> ve solo Vender, Inventario (sin costos), Calendario, Eventos, Turnos.
          </div>

          {loading ? (
            <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando usuarios...</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">Sin usuarios registrados.</p>
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-3 py-2 font-medium">Usuario</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">PIN</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Rol demo</th>
                    <th className="text-center px-3 py-2 font-medium">Acceso cantina</th>
                    <th className="text-center px-3 py-2 font-medium">Activo</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => {
                    const isCurrentUser = p.id === user?.id;
                    const isSaving = savingId === p.id;
                    const cantinaRole = p.cantina_role || "staff";
                    return (
                      <tr key={p.id} className="border-t border-stone-100">
                        <td className="px-3 py-2">
                          <p className="text-sm font-medium text-stone-800">
                            {p.name || "(sin nombre)"}
                            {isCurrentUser && <span className="ml-2 text-[10px] uppercase tracking-wider text-brand">Tu</span>}
                          </p>
                          {p.phone && <p className="text-[10px] text-stone-400">{p.phone}</p>}
                        </td>
                        <td className="px-3 py-2 text-stone-500 text-xs hidden md:table-cell">
                          {p.pin ? <span className="font-mono">{p.pin}</span> : <span className="text-stone-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-stone-500 text-xs hidden md:table-cell capitalize">{p.role || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex bg-stone-100 rounded-lg p-0.5">
                            {["staff", "gerente", "owner"].map((role) => {
                              const active = cantinaRole === role || (role === "gerente" && cantinaRole === "admin");
                              const colors = {
                                staff: active ? "bg-white text-stone-700 shadow-sm" : "text-stone-500 hover:text-stone-700",
                                gerente: active ? "bg-brand text-white shadow-sm" : "text-stone-500 hover:text-stone-700",
                                owner: active ? "bg-gold text-white shadow-sm" : "text-stone-500 hover:text-stone-700",
                              };
                              return (
                                <button
                                  key={role}
                                  onClick={() => setCantinaRole(p.id, role)}
                                  disabled={isSaving || active}
                                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors capitalize ${colors[role]}`}
                                >
                                  {role}
                                </button>
                              );
                            })}
                          </div>
                          {isSaving && <Loader2 size={10} className="animate-spin inline ml-1 text-stone-400" />}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {p.is_active ? <Check size={14} className="text-green-500 inline" /> : <X size={14} className="text-stone-300 inline" />}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {p.pin && (
                            <button onClick={() => { setResetPinFor(p); setNewPin(""); }} className="text-[11px] text-brand hover:underline">
                              Reset PIN
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "sistema" && (
        <div className="space-y-3">
          {/* Killswitch ventas */}
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
                  <Power size={14} className={killswitchSales.enabled ? "text-red-600" : "text-stone-400"} />
                  Killswitch ventas cantina
                </h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Cuando esta activo, el POS bloquea todas las ventas con el mensaje de abajo. Util para cerrar inesperadamente o por inventario critico.
                </p>
              </div>
              <button
                onClick={() => saveKillswitchSales({ enabled: !killswitchSales.enabled })}
                disabled={killswitchSalesLoading}
                className={`w-12 h-6 rounded-full transition-colors shrink-0 ${killswitchSales.enabled ? "bg-red-500" : "bg-stone-300"}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${killswitchSales.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
            <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block mb-1">Mensaje al staff</label>
            <input
              type="text"
              value={killswitchSales.message || ""}
              onChange={(e) => setKillswitchSales({ ...killswitchSales, message: e.target.value })}
              onBlur={() => saveKillswitchSales({})}
              placeholder="Cantina cerrada temporalmente"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            {killswitchSales.enabled && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle size={12} /> Ventas BLOQUEADAS en este momento. Recuerda desactivar para volver a operar.
              </div>
            )}
          </div>

          {/* Topes cortesia */}
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2 mb-1">
              <Gift size={14} /> Topes de cortesia por usuario
            </h3>
            <p className="text-[11px] text-stone-500 mb-3">
              Limite mensual REF que cada admin/gerente puede regalar como cortesia. Vacio = sin limite. Owner siempre sin limite.
            </p>
            <div className="space-y-1">
              {profiles.filter((p) => p.cantina_role && p.cantina_role !== "staff").map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-stone-700">{p.name}</span>
                  <span className="text-[10px] text-stone-400 uppercase tracking-wider">{p.cantina_role}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={p.cortesia_limit_monthly_ref ?? ""}
                    onBlur={(e) => setCortesiaLimit(p.id, e.target.value)}
                    placeholder="Sin limite"
                    className="w-24 border border-stone-300 rounded-lg px-2 py-1 text-xs focus:border-brand focus:outline-none"
                  />
                  <span className="text-[10px] text-stone-400 w-12">REF/mes</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "verComo" && (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
            Cambia tu vista para previsualizar la app como otro rol. Util para verificar que staff no ve info financiera. Al salir / refrescar / cerrar sesion, vuelves a admin.
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Estado actual</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-stone-500">Logueado como:</span>
              <span className="font-medium text-stone-800">{user?.name}</span>
              <span className="text-stone-400">·</span>
              <span className="text-stone-500">Rol real:</span>
              <span className="font-bold text-brand">{user?.cantinaRole}</span>
            </div>
            {impersonatedRole && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900 flex items-center justify-between gap-2">
                <span><b>Viendo como:</b> {impersonatedRole}</span>
                <button onClick={() => onImpersonate(null)} className="text-amber-700 underline">Volver a admin</button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Previsualizar como</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <button
                onClick={() => onImpersonate("staff")}
                disabled={impersonatedRole === "staff"}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  impersonatedRole === "staff" ? "border-brand bg-brand/5" : "border-stone-200 hover:border-stone-300"
                }`}
              >
                <p className="text-sm font-bold text-stone-800">Staff</p>
                <p className="text-[11px] text-stone-500 mt-1">
                  Vender, Inventario (sin valor/proveedores), Calendario, Eventos, Turnos. SIN Caja, Reportes, Costos, Config, Clientes, Puntos, Admin.
                </p>
              </button>
              <button
                onClick={() => onImpersonate("gerente")}
                disabled={impersonatedRole === "gerente"}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  impersonatedRole === "gerente" ? "border-brand bg-brand/5" : "border-stone-200 hover:border-stone-300"
                }`}
              >
                <p className="text-sm font-bold text-stone-800">Gerente</p>
                <p className="text-[11px] text-stone-500 mt-1">
                  Acceso completo a operaciones: Caja, Reportes, Costos, Config, Clientes, Puntos. SIN Admin (este tab).
                </p>
              </button>
            </div>
            <p className="text-[10px] text-stone-400">
              Owner es tu rol real. Para volver, usa el banner amarillo arriba.
            </p>
          </div>
        </div>
      )}

      {tab === "ideas" && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            Sugerencias de capabilities que solo tu (owner) deberias tener — extiende el sistema cuando lo necesites.
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">Solo owner (no admin staff)</p>
            <ul className="space-y-2 text-sm text-stone-700">
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Asignar PIN admin a otros:</b> solo tu deberias poder ascender a alguien a admin. Hoy cualquier admin puede.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Reset PINs:</b> reset PIN de cualquier usuario si lo olvida o si dejo el trabajo.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Borrar ventas / movimientos:</b> hoy el sistema permite anular (5min). Para borrar venta vieja: solo owner.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Ajustar costos historicos:</b> override MAC manualmente para reconciliar con inventario fisico.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Ver actividad de cada empleado:</b> audit log de quien anulo, quien dio cortesia, quien hizo override de cost.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Configurar tasa BCV oficial vs interna:</b> margen de exchange rate (la tasa que cantina usa puede diferir de BCV oficial).</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Aprobar gastos {">"} REF X:</b> gastos altos requieren tu aprobacion antes de pago.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Export financiero mensual:</b> reporte cerrado al cierre de mes que admin no puede modificar.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Configurar topes de cortesia por staff:</b> cada admin/staff tiene un limite REF/mes en cortesias.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Acceso a "Costos" pricing:</b> ver precio de compra a proveedores quizas solo tu/Yusmelly, no Jose Gregorio.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Modificar contratos/sueldos:</b> visible y editable solo por owner.</span></li>
              <li className="flex gap-2"><span className="text-brand">•</span> <span><b>Cerrar la cantina:</b> killswitch que desactiva todas las ventas (ej: por inventario muy bajo, evento privado).</span></li>
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">Granularidad sugerida (3 niveles)</p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-bold text-stone-800">Owner (tu, Giancarlo)</p>
                <p className="text-xs text-stone-500">Todo lo anterior + crear/eliminar usuarios admin.</p>
              </div>
              <div>
                <p className="font-bold text-stone-800">Admin (Jose Gregorio, Yusmelly)</p>
                <p className="text-xs text-stone-500">Caja, Reportes, Costos (lectura), Config (categorias/descuentos/empleados/stock), Clientes, Puntos. NO puede borrar ventas viejas ni ajustar MAC.</p>
              </div>
              <div>
                <p className="font-bold text-stone-800">Staff</p>
                <p className="text-xs text-stone-500">Solo operativo: Vender, ver Inventario (sin costos), Turnos, Calendario, Eventos.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN modal */}
      {resetPinFor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setResetPinFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                <Key size={14} /> Reset PIN — {resetPinFor.name}
              </h3>
              <button onClick={() => setResetPinFor(null)} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-stone-500 font-medium block">Nuevo PIN (4-8 digitos)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                maxLength={8}
                autoFocus
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-lg font-mono tracking-widest text-center focus:border-brand focus:outline-none"
              />
              <p className="text-[11px] text-stone-400">El PIN actual sera reemplazado. Avisa al usuario.</p>
            </div>
            <div className="flex gap-2 px-5 py-3 border-t border-stone-100 bg-stone-50 rounded-b-2xl">
              <button onClick={() => setResetPinFor(null)} className="flex-1 px-3 py-2 text-xs text-stone-600 hover:bg-stone-100 rounded-lg font-medium">Cancelar</button>
              <button onClick={handleResetPin} disabled={!newPin || newPin.length < 4} className="flex-1 px-3 py-2 text-xs text-white bg-brand hover:bg-brand-dark disabled:opacity-50 rounded-lg font-medium">Reset PIN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
