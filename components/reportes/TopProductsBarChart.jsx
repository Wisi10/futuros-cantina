"use client";
import { useMemo } from "react";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

export default function TopProductsBarChart({ data }) {
  const { labels, qty, totals } = useMemo(() => {
    const arr = data || [];
    return {
      labels: arr.map((p) => p.product_name || "—"),
      qty: arr.map((p) => Number(p.qty_total || 0)),
      totals: arr.map((p) => Number(p.total_ref || 0)),
    };
  }, [data]);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Cantidad",
        data: qty,
        backgroundColor: "#7c3aed",
        borderRadius: 6,
      },
    ],
  };

  const options = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.parsed.x} u · REF ${totals[ctx.dataIndex]?.toFixed(2)}`,
        },
      },
    },
    scales: {
      x: { beginAtZero: true, ticks: { font: { size: 10 }, color: "#a8a29e" }, grid: { color: "rgba(0,0,0,0.04)" } },
      y: { ticks: { font: { size: 10 }, color: "#57534e" }, grid: { display: false } },
    },
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider mb-2">Top 10 productos</p>
      {labels.length === 0 ? (
        <p className="text-xs text-stone-400 text-center py-6">Sin ventas</p>
      ) : (
        <div style={{ height: Math.max(220, labels.length * 28) }}>
          <Bar data={chartData} options={options} />
        </div>
      )}
    </div>
  );
}
