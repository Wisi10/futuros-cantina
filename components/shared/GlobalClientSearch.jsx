"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClientProfile } from "@/lib/clientProfileContext";
import { avatarColor, avatarInitials, formatVePhone } from "@/lib/clientHelpers";

export default function GlobalClientSearch() {
  const { open } = useClientProfile();
  const [expanded, setExpanded] = useState(false); // mobile collapse state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, phone, cedula")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,cedula.ilike.%${q}%`)
        .limit(8);
      setResults(data || []);
      setLoading(false);
      setShowDropdown(true);
    }, 250);
  }, [query]);

  // Close on click outside or Esc
  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setExpanded(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setShowDropdown(false);
        setQuery("");
        setExpanded(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handlePick = (id) => {
    open(id);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    setExpanded(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Mobile: collapsed icon button */}
      {!expanded && (
        <button
          onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="md:hidden p-2 rounded-lg hover:bg-stone-100 text-stone-500"
          title="Buscar cliente"
        >
          <Search size={16} />
        </button>
      )}

      {/* Desktop: always visible. Mobile: visible when expanded */}
      <div className={`${expanded ? "fixed inset-x-3 top-16 z-40" : "hidden"} md:relative md:inset-auto md:top-auto md:block md:w-56`}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
            placeholder="Buscar cliente..."
            className="w-full bg-white border border-stone-300 rounded-lg pl-9 pr-8 py-1.5 text-xs focus:border-brand focus:outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); setShowDropdown(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {showDropdown && (loading || results.length > 0 || query.length >= 2) && (
          <div className="absolute right-0 left-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-stone-400 animate-pulse text-center py-3">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-3">Sin resultados</p>
            ) : (
              results.map((c) => {
                const fullName = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(sin nombre)";
                const color = avatarColor(fullName);
                return (
                  <button
                    key={c.id}
                    onClick={() => handlePick(c.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 hover:bg-stone-50 text-left border-b border-stone-100 last:border-0"
                  >
                    <div className={`w-7 h-7 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-[11px] font-bold shrink-0`}>
                      {avatarInitials(fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-stone-800 truncate">{fullName}</p>
                      <p className="text-[10px] text-stone-400 truncate">
                        {c.phone ? formatVePhone(c.phone) : (c.cedula ? `cedula ${c.cedula}` : "—")}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
