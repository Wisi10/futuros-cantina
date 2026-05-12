"use client";
import { useState, useEffect, useCallback } from "react";
import { Shield, Users, Eye, Lightbulb, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

const TABS = [
  { id: "permisos", label: "Permisos", icon: Users },
  { id: "verComo", label: "Ver como", icon: Eye },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
];

export default function AdminView({ user, onImpersonate, impersonatedRole }) {
  const [tab, setTab] = useState("permisos");
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from("user_profiles")
      .select("id, name, role, cantina_role, is_active, pin, phone")
      .order("name");
    setProfiles(data || []);
    setLoading(false);
  }, []);

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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
    </div>
  );
}
