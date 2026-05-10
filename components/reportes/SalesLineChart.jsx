"use client";
import { useMemo, useEffect } from "react";
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

function fmtDay(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}`;
}

export default function SalesLineChart({ data }) {
  const { labels, values } = useMemo(() => {
    const labels = (data || []).map((d) => fmtDay(d.day));
    const values = (data || []).map((d) => Number(d.total_ref || 0));
    return { labels, values };
  }, [data]);

  const chartData = {
    labels,
    datasets: [
      {
        label: "REF",
        data: values,
        borderColor: "#8b5cf6",
        backgroundColor: "rgba(139, 92, 246, 0.12)",
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#8b5cf6",
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `REF ${Number(ctx.parsed.y).toFixed(2)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#a8a29e" } },
      y: { beginAtZero: true, ticks: { font: { size: 10 }, color: "#a8a29e", callback: (v) => `REF ${v}` }, grid: { color: "rgba(0,0,0,0.04)" } },
    },
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider mb-2">Ventas por dia</p>
      <div style={{ height: 220 }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
