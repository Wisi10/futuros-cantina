"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Cake, Trophy, Briefcase, Activity, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
import EventosView from "@/components/eventos/EventosView";

const OPERATING_HOURS = { start: 8, end: 22 };
const ROW_HEIGHT = 56;
const COL_WIDTH = 124;
const HEADER_HEIGHT = 44;

const ACTIVITY_META = {
  alquiler:    { label: "Alquiler",    bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-400",   icon: Activity,  hex: "#3b82f6" },
  cumpleanos:  { label: "Cumpleaños",  bg: "bg-pink-100",   text: "text-pink-700",   border: "border-pink-400",   icon: Cake,      hex: "#ec4899" },
  academia:    { label: "Academia",    bg: "bg-green-100",  text: "text-green-700",  border: "border-green-400",  icon: Trophy,    hex: "#22c55e" },
  torneo:      { label: "Torneo",      bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-400", icon: Trophy,    hex: "#a855f7" },
  evento:      { label: "Evento",      bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-400",  icon: Briefcase, hex: "#f59e0b" },
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

const fmtShortHour = (h) => {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  const period = hour >= 12 ? "p" : "a";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return min > 0 ? `${display}:${String(min).padStart(2, "0")}${period}` : `${display}${period}`;
};

export default function CalendarioView({ user, rate, onNavigate }) {
  const [subTab, setSubTab] = useState("reservas");
  const [date, setDate] = useState(todayISO());
  const [bookings, setBookings] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [bookingsRes, courtsRes] = await Promise.all([
      supabase.rpc("get_cantina_calendar_bookings", { p_start_date: date, p_end_date: date }),
      supabase.from("courts").select("id, name, type, is_active, sort_order").order("sort_order"),
    ]);
    const activeCourts = (courtsRes.data || []).filter((c) => c.is_active !== false);
    setBookings(bookingsRes.data || []);
    setCourts(activeCourts);
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const hours = useMemo(
    () => Array.from({ length: OPERATING_HOURS.end - OPERATING_HOURS.start }, (_, i) => i + OPERATING_HOURS.start),
    []
  );

  const bookingsAtCourt = useCallback(
    (courtId) =>
      bookings.filter((b) => {
        const cids = Array.isArray(b.court_ids) ? b.court_ids : [];
        return cids.includes(courtId);
      }),
    [bookings]
  );

  const bookingCoversCell = (b, hour) => {
    const start = Number(b.start_hour);
    const dur = Number(b.duration) || 1;
    return hour >= start && hour < start + dur;
  };

  const totalCount = bookings.length;
  const byType = useMemo(() => {
    const c = {};
    bookings.forEach((b) => {
      const t = b.activity_type || "alquiler";
      c[t] = (c[t] || 0) + 1;
    });
    return c;
  }, [bookings]);

  const goPrev = () => setDate(addDays(date, -1));
  const goNext = () => setDate(addDays(date, 1));
  const goToday = () => setDate(todayISO());
  const isToday = date === todayISO();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-2 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h1 className="font-bold text-brand text-lg flex items-center gap-2">
            <CalendarRange size={20} /> Calendario
          </h1>
        </div>
        <div className="flex gap-1 border-b border-stone-200">
          <button
            onClick={() => setSubTab("reservas")}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1.5 ${
              subTab === "reservas" ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            <CalendarRange size={12} /> Reservas
          </button>
          <button
            onClick={() => setSubTab("eventos")}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1.5 ${
              subTab === "eventos" ? "border-brand text-brand" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            <Calendar size={12} /> Eventos
          </button>
        </div>
      </div>

      {subTab === "eventos" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <EventosView user={user} rate={rate} onNavigate={onNavigate} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-6 pt-3 pb-3 shrink-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <button onClick={goPrev} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors" title="Anterior">
                <ChevronLeft size={14} />
              </button>
              <button onClick={goNext} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors" title="Siguiente">
                <ChevronRight size={14} />
              </button>
              {!isToday && (
                <button onClick={goToday} className="px-2.5 py-1 rounded-lg border border-stone-200 hover:bg-stone-50 text-xs font-medium text-stone-600 transition-colors">
                  Hoy
                </button>
              )}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-2.5 py-1 border border-stone-200 rounded-lg text-xs focus:border-brand focus:outline-none bg-white"
              />
              <span className="text-sm text-stone-600 font-medium capitalize ml-1">{fmtDateLong(date)}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <KpiPill label="Reservas" value={totalCount} color="text-brand" />
              {Object.entries(byType).map(([type, count]) => {
                const meta = ACTIVITY_META[type] || { label: type, bg: "bg-stone-100", text: "text-stone-700" };
                return <KpiPill key={type} label={meta.label} value={count} pillClass={`${meta.bg} ${meta.text} border-transparent`} />;
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
            {loading ? (
              <p className="text-sm text-stone-400 animate-pulse py-8 text-center">Cargando reservas...</p>
            ) : courts.length === 0 ? (
              <p className="text-sm text-stone-400 py-8 text-center">No hay canchas configuradas.</p>
            ) : (
              <div className="bg-white rounded-xl border border-stone-200 overflow-hidden h-full flex flex-col">
                <div className="overflow-auto flex-1">
                  <div className="min-w-max">
                    <div className="flex border-b border-stone-200 sticky top-0 bg-white z-30" style={{ height: HEADER_HEIGHT }}>
                      <div className="flex-shrink-0 bg-stone-50 border-r border-stone-200 flex items-center justify-center text-[10px] text-stone-400 font-medium sticky left-0 z-40" style={{ width: 52 }}>
                        Hora
                      </div>
                      {courts.map((c) => (
                        <div
                          key={c.id}
                          className="flex-shrink-0 bg-stone-50 border-r border-stone-200 last:border-r-0 flex flex-col items-center justify-center"
                          style={{ width: COL_WIDTH }}
                        >
                          <span className="font-semibold text-xs text-stone-700">{c.name}</span>
                          <span className="text-[10px] text-stone-400">{c.type}</span>
                        </div>
                      ))}
                    </div>

                    {hours.map((hour) => {
                      const hh = Math.floor(hour);
                      const period = hh >= 12 ? "p" : "a";
                      const displayH = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
                      const shortTime = `${displayH}${period}`;

                      return (
                        <div key={hour} className="flex border-b border-stone-100 last:border-b-0" style={{ height: ROW_HEIGHT }}>
                          <div
                            className="flex-shrink-0 bg-stone-50 border-r border-stone-200 flex items-start pt-1 justify-center text-[10px] font-medium text-stone-400 sticky left-0 z-20"
                            style={{ width: 52 }}
                          >
                            {shortTime}
                          </div>
                          {courts.map((court) => {
                            const courtBookings = bookingsAtCourt(court.id);
                            const covering = courtBookings.find((b) => bookingCoversCell(b, hour));
                            if (covering && Math.floor(Number(covering.start_hour)) !== hour) {
                              return <div key={court.id} className="flex-shrink-0 border-r border-stone-100 last:border-r-0" style={{ width: COL_WIDTH }} />;
                            }
                            const startsHere = courtBookings.find((b) => Math.floor(Number(b.start_hour)) === hour);
                            return (
                              <div
                                key={court.id}
                                className="flex-shrink-0 border-r border-stone-100 last:border-r-0 p-0.5 relative overflow-visible"
                                style={{ width: COL_WIDTH }}
                              >
                                {startsHere && (
                                  <BookingTile booking={startsHere} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BookingTile({ booking }) {
  const meta = ACTIVITY_META[booking.activity_type] || {
    label: booking.activity_type || "—",
    bg: "bg-stone-100",
    text: "text-stone-700",
    border: "border-stone-400",
    icon: Activity,
  };
  const Icon = meta.icon;
  const bStart = Number(booking.start_hour);
  const dur = Number(booking.duration) || 1;
  const bEnd = bStart + dur;
  const timeRange = `${fmtShortHour(bStart)} – ${fmtShortHour(bEnd)}`;
  const clientName = booking.client_name || "Sin cliente";
  const offsetTop = (bStart % 1) * ROW_HEIGHT;
  const height = dur * ROW_HEIGHT - 4;

  return (
    <div
      className={`absolute left-0.5 right-0.5 ${meta.bg} ${meta.text} border-l-4 ${meta.border} rounded-r-md px-1.5 py-1 overflow-hidden`}
      style={{ top: `${offsetTop}px`, height: `${height}px`, zIndex: 10 }}
    >
      <div className="text-[9px] opacity-70 leading-tight">{timeRange}</div>
      <div className="text-[11px] font-semibold leading-tight truncate">{clientName}</div>
      {dur >= 1 && (
        <div className="text-[9px] opacity-80 leading-tight truncate flex items-center gap-0.5 mt-0.5">
          <Icon size={9} className="flex-shrink-0" />
          <span className="truncate">{meta.label}{dur > 0 ? ` · ${dur}h` : ""}</span>
        </div>
      )}
      {booking.birthday_package && dur >= 1.5 && (
        <div className="text-[9px] opacity-60 leading-tight truncate mt-0.5">{booking.birthday_package}</div>
      )}
    </div>
  );
}

function KpiPill({ label, value, color, pillClass }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${pillClass ? pillClass : "bg-white border-stone-200"}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70 font-medium">{label}</p>
      <p className={`text-lg font-extrabold ${color || ""}`}>{value}</p>
    </div>
  );
}
