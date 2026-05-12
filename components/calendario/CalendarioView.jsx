"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Clock, MapPin, User, Cake, Trophy, Briefcase, Activity } from "lucide-react";
import { supabase } from "@/lib/supabase";

const ACTIVITY_META = {
  alquiler:    { label: "Alquiler",    color: "bg-blue-100 text-blue-700 border-blue-200",       icon: Activity },
  cumpleanos:  { label: "Cumpleanos",  color: "bg-pink-100 text-pink-700 border-pink-200",       icon: Cake },
  academia:    { label: "Academia",    color: "bg-green-100 text-green-700 border-green-200",    icon: Trophy },
  torneo:      { label: "Torneo",      color: "bg-purple-100 text-purple-700 border-purple-200", icon: Trophy },
  evento:      { label: "Evento",      color: "bg-amber-100 text-amber-700 border-amber-200",    icon: Briefcase },
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const fmtDateLong = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Caracas" });
};

const fmtHour = (h) => {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return min === 0 ? `${display}${suffix}` : `${display}:${String(min).padStart(2, "0")}${suffix}`;
};

const fmtEndHour = (start, dur) => fmtHour(start + dur);

export default function CalendarioView({ user }) {
  const [date, setDate] = useState(todayISO());
  const [bookings, setBookings] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("day"); // day | week

  const range = useMemo(() => {
    if (view === "day") return { start: date, end: date };
    // week: lunes a domingo desde la fecha
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = (dt.getDay() + 6) % 7; // 0 = lunes
    const start = new Date(dt);
    start.setDate(dt.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return { start: fmt(start), end: fmt(end) };
  }, [date, view]);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [bookingsRes, courtsRes] = await Promise.all([
      supabase.rpc("get_cantina_calendar_bookings", { p_start_date: range.start, p_end_date: range.end }),
      supabase.from("courts").select("id, name, type").order("id"),
    ]);
    setBookings(bookingsRes.data || []);
    setCourts(courtsRes.data || []);
    setLoading(false);
  }, [range.start, range.end]);

  useEffect(() => { load(); }, [load]);

  const courtNameById = useMemo(() => {
    const map = {};
    courts.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [courts]);

  const courtLabel = (b) => {
    if (b.court_name) return b.court_name;
    if (Array.isArray(b.court_ids) && b.court_ids.length > 0) {
      return b.court_ids.map((id) => courtNameById[id] || `#${id}`).join(", ");
    }
    return "—";
  };

  const bookingsByDate = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      if (!map[b.date]) map[b.date] = [];
      map[b.date].push(b);
    });
    return map;
  }, [bookings]);

  // KPIs del periodo
  const totalCount = bookings.length;
  const byType = useMemo(() => {
    const counts = {};
    bookings.forEach((b) => {
      const t = b.activity_type || "alquiler";
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [bookings]);

  // Operating hours (8am - 10pm) — para mostrar slots vacios en day view
  const datesInRange = useMemo(() => {
    const out = [];
    let cur = range.start;
    while (cur <= range.end) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }, [range.start, range.end]);

  const goPrev = () => setDate(addDays(date, view === "day" ? -1 : -7));
  const goNext = () => setDate(addDays(date, view === "day" ? 1 : 7));
  const goToday = () => setDate(todayISO());

  const isToday = date === todayISO();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h1 className="font-bold text-brand text-lg flex items-center gap-2">
            <CalendarRange size={20} /> Calendario
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex bg-stone-100 rounded-lg p-0.5">
              <button
                onClick={() => setView("day")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === "day" ? "bg-white text-brand shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Dia
              </button>
              <button
                onClick={() => setView("week")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === "week" ? "bg-white text-brand shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Semana
              </button>
            </div>
          </div>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
            title="Anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
            title="Siguiente"
          >
            <ChevronRight size={14} />
          </button>
          {!isToday && (
            <button
              onClick={goToday}
              className="px-2.5 py-1 rounded-lg border border-stone-200 hover:bg-stone-50 text-xs font-medium text-stone-600 transition-colors"
            >
              Hoy
            </button>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2.5 py-1 border border-stone-200 rounded-lg text-xs focus:border-brand focus:outline-none bg-white"
          />
          <span className="text-sm text-stone-600 font-medium capitalize ml-1">
            {view === "day" ? fmtDateLong(date) : `${fmtDateLong(range.start)} → ${fmtDateLong(range.end)}`}
          </span>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KpiPill label="Reservas" value={totalCount} color="text-brand" />
          {Object.entries(byType).slice(0, 3).map(([type, count]) => {
            const meta = ACTIVITY_META[type] || { label: type, color: "bg-stone-100 text-stone-700" };
            return <KpiPill key={type} label={meta.label} value={count} pillClass={meta.color} />;
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando reservas...</p>
        ) : datesInRange.length === 0 ? null : (
          <div className="space-y-4">
            {datesInRange.map((d) => {
              const dayBookings = bookingsByDate[d] || [];
              const isCurrentDate = d === todayISO();
              return (
                <div key={d} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className={`px-4 py-2 border-b border-stone-100 flex items-center justify-between ${isCurrentDate ? "bg-brand/5" : "bg-stone-50"}`}>
                    <span className={`text-sm font-bold capitalize ${isCurrentDate ? "text-brand" : "text-stone-700"}`}>
                      {fmtDateLong(d)}
                      {isCurrentDate && <span className="ml-2 text-[10px] uppercase tracking-wider text-brand">Hoy</span>}
                    </span>
                    <span className="text-xs text-stone-500">
                      {dayBookings.length} reserva{dayBookings.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {dayBookings.length === 0 ? (
                    <p className="text-xs text-stone-400 text-center py-6">Sin reservas</p>
                  ) : (
                    <div className="divide-y divide-stone-100">
                      {dayBookings.map((b) => {
                        const meta = ACTIVITY_META[b.activity_type] || { label: b.activity_type || "—", color: "bg-stone-100 text-stone-700 border-stone-200", icon: Activity };
                        const Icon = meta.icon;
                        return (
                          <div key={b.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50/50 transition-colors">
                            <div className="text-right shrink-0 w-20">
                              <p className="text-sm font-bold text-stone-800">{fmtHour(b.start_hour)}</p>
                              <p className="text-[10px] text-stone-400">a {fmtEndHour(b.start_hour, b.duration)}</p>
                            </div>
                            <div className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center ${meta.color}`}>
                              <Icon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-stone-800 truncate flex items-center gap-1.5">
                                <User size={12} className="text-stone-400 shrink-0" />
                                {b.client_name || "Sin nombre"}
                                {b.birthday_package && (
                                  <span className="text-[10px] text-pink-600 font-normal">· {b.birthday_package}</span>
                                )}
                              </p>
                              <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                                <MapPin size={10} className="text-stone-400 shrink-0" />
                                {courtLabel(b)}
                                {b.type && <span className="text-stone-400 ml-1">· {b.type}</span>}
                              </p>
                            </div>
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded shrink-0 ${meta.color}`}>
                              {meta.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiPill({ label, value, color, pillClass }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${pillClass ? `${pillClass}` : "bg-white border-stone-200"}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70 font-medium">{label}</p>
      <p className={`text-lg font-extrabold ${color || ""}`}>{value}</p>
    </div>
  );
}
