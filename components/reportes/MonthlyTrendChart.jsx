"use client";
import { useMemo } from "react";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const MONTH_LABELS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function lastNMonthsKeys(n) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    out.push({ key, label });
  }
  return out;
}

export default function MonthlyTrendChart({ data, onMonthClick }) {
  // data: [{ sale_date, total_ref }]
  const { labels, values, monthKeys } = useMemo(() => {
    const months = lastNMonthsKeys(12);
    const byMonth = {};
    (data || []).forEach((s) => {
      const key = String(s.sale_date || "").slice(0, 7);
      if (!key) return;
      byMonth[key] = (byMonth[key] || 0) + Number(s.total_ref || 0);
    });
    return {
      labels: months.map((m) => m.label),
      values: months.map((m) => byMonth[m.key] || 0),
      monthKeys: months.map((m) => m.key),
    };
  }, [data]);

  const maxVal = Math.max(...values, 0);
  const currentIdx = values.length - 1;

  const chartData = {
    labels,
    datasets: [
      {
        label: "USD",
        data: values,
        backgroundColor: values.map((v, i) =>
          i === currentIdx ? "#B8963E" : "rgba(184, 150, 62, 0.55)"
        ),
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (evt, els) => {
      if (els && els.length > 0 && onMonthClick) {
        onMonthClick(monthKeys[els[0].index]);
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => `$${Number(ctx.parsed.y).toFixed(2)}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#78716c" } },
      y: { beginAtZero: true, ticks: { font: { size: 10 }, color: "#a8a29e", callback: (v) => `$${v}` }, grid: { color: "rgba(0,0,0,0.04)" } },
    },
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider">
          Ventas últimos 12 meses
        </p>
        {maxVal > 0 && (
          <p className="text-[10px] text-stone-400">
            Click una barra para filtrar a ese mes
          </p>
        )}
      </div>
      <div style={{ height: 220 }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}
