"use client";
import { useClientProfile } from "@/lib/clientProfileContext";

// Render a client name as a clickable link that opens the global profile
// modal. Falls back to plain text if no clientId.
export default function ClientLink({ clientId, name, className = "", muted = false }) {
  const { open } = useClientProfile();
  const display = (name && String(name).trim()) || "(sin nombre)";
  if (!clientId) {
    return <span className={className}>{display}</span>;
  }
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); open(clientId); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); open(clientId); } }}
      className={`cursor-pointer hover:underline ${muted ? "text-stone-500 hover:text-stone-700" : "text-brand hover:text-brand-dark"} ${className}`}
    >
      {display}
    </span>
  );
}
