"use client";

const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const BUCKETS = [
  { id: 0, label: "10-13" },
  { id: 1, label: "14-17" },
  { id: 2, label: "18-20" },
  { id: 3, label: "21-c" },
];

function colorFor(value, max) {
  if (max <= 0 || value <= 0) return "rgba(124, 58, 237, 0.05)";
  const intensity = Math.min(1, value / max);
  return `rgba(124, 58, 237, ${0.1 + intensity * 0.8})`;
}

export default function HoursHeatmap({ data }) {
  // data: [{day_of_week, hour_bucket, count}]
  const grid = Array.from({ length: 7 }, () => Array(4).fill(0));
  let max = 0;
  for (const row of data || []) {
    const d = Number(row.day_of_week);
    const b = Number(row.hour_bucket);
    const c = Number(row.count || 0);
    if (d >= 0 && d < 7 && b >= 0 && b < 4) {
      grid[d][b] = c;
      if (c > max) max = c;
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider mb-3">Heatmap horas (count)</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-separate" style={{ borderSpacing: "4px" }}>
          <thead>
            <tr>
              <th className="text-left text-stone-400 font-medium pr-2"></th>
              {BUCKETS.map((b) => (
                <th key={b.id} className="text-stone-500 font-medium px-2 py-1">{b.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, i) => (
              <tr key={day}>
                <td className="text-stone-500 font-medium pr-2 py-1">{day}</td>
                {BUCKETS.map((b) => {
                  const v = grid[i][b.id];
                  return (
                    <td
                      key={b.id}
                      title={`${day} ${b.label}: ${v}`}
                      style={{
                        background: colorFor(v, max),
                        minWidth: 56,
                      }}
                      className="text-center text-[11px] font-bold text-stone-700 rounded px-2 py-2"
                    >
                      {v > 0 ? v : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
