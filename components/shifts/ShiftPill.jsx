"use client";

export default function ShiftPill({ shift, onClick }) {
  const isOpen = !!shift;
  const openTime = shift?.opened_at
    ? new Date(shift.opened_at).toLocaleTimeString("es-VE", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <button
      onClick={onClick}
      title={isOpen ? `Turno abierto desde ${openTime}` : "Sin turno abierto"}
      className="flex items-center gap-1.5 px-2 py-1 rounded-full border transition-colors hover:bg-stone-50"
      style={{ borderColor: "rgba(0,0,0,0.08)" }}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${isOpen ? "bg-ok" : "bg-stone-300"}`}
        style={isOpen ? { animation: "pulse-dot 2s ease-in-out infinite" } : {}}
      />
      {isOpen ? (
        <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "#6B6B6B" }}>
          {openTime}
        </span>
      ) : (
        <span className="text-[10px] text-stone-400">Cerrado</span>
      )}
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </button>
  );
}
