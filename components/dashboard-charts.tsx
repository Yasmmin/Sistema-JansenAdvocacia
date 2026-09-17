"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

export type MonthlyProcessPoint = {
  month: string;
  label: string;
  fresh: number;
  progress: number;
  done: number;
};

export type ProcessStatusPoint = {
  key: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
};

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function ProcessEvolutionChart({
  monthly,
  loading,
  periodMonths,
}: {
  monthly: MonthlyProcessPoint[];
  loading: boolean;
  periodMonths: number;
}) {
  const hasData = monthly.some((point) => point.fresh + point.progress + point.done > 0);

  if (loading) {
    return <div className="grid h-[280px] place-items-center text-sm text-[#687a92]">Carregando evolução processual…</div>;
  }

  if (!monthly.length || !hasData) {
    return <div className="grid h-[280px] place-items-center text-sm text-[#687a92]">Sem movimentações no período selecionado.</div>;
  }

  const data: ChartData<"bar"> = {
    labels: monthly.map((point) => point.label),
    datasets: [
      {
        label: "Novos",
        data: monthly.map((point) => point.fresh),
        backgroundColor: "#071a3b",
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 22,
      },
      {
        label: "Intimações",
        data: monthly.map((point) => point.progress),
        backgroundColor: "#3b82f6",
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 22,
      },
      {
        label: "Concluídos",
        data: monthly.map((point) => point.done),
        backgroundColor: "#10adc4",
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 22,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        stacked: true,
        border: { display: false },
        grid: { display: false },
        ticks: {
          autoSkip: true,
          maxRotation: 0,
          maxTicksLimit: periodMonths > 12 ? 12 : periodMonths,
          color: "#6d7f98",
          font: { size: 10, family: "inherit", weight: 500 },
        },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        border: { display: false },
        grid: { color: "#edf0f4" },
        ticks: {
          precision: 0,
          color: "#91a2b9",
          font: { size: 10, family: "inherit" },
          callback: (value) => numberFormatter.format(Number(value)),
        },
      },
    },
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          padding: 10,
          color: "#415168",
          font: { size: 10, family: "inherit", weight: 500 },
          usePointStyle: true,
          pointStyle: "rectRounded",
        },
      },
      tooltip: {
        backgroundColor: "#070e1d",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (context) => `${context.dataset.label}: ${numberFormatter.format(Number(context.raw))}`,
          footer: (items) => `Total: ${numberFormatter.format(items.reduce((sum, item) => sum + Number(item.raw), 0))}`,
        },
      },
    },
  };

  return (
    <figure className="min-w-0">
      <div className="h-[280px] w-full min-w-0">
        <Bar
          data={data}
          options={options}
          role="img"
          aria-label={`Evolução mensal de novos processos, publicações DJEN e processos concluídos nos últimos ${periodMonths} meses.`}
        />
      </div>
      <table className="sr-only">
        <caption>Dados mensais da evolução processual</caption>
        <thead><tr><th>Mês</th><th>Novos processos</th><th>Publicações DJEN</th><th>Concluídos</th></tr></thead>
        <tbody>{monthly.map((point) => <tr key={point.month}><th>{point.label}</th><td>{point.fresh}</td><td>{point.progress}</td><td>{point.done}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export function ProcessStatusChart({
  statuses,
  total,
  loading,
}: {
  statuses: ProcessStatusPoint[];
  total: number;
  loading: boolean;
}) {
  const visibleStatuses = statuses.filter((status) => status.count > 0);

  if (loading) {
    return <div className="grid size-[168px] place-items-center rounded-full bg-[#edf2f7] text-xs text-[#687a92]">Carregando…</div>;
  }

  if (!visibleStatuses.length) {
    return <div className="grid size-[168px] place-items-center rounded-full border-[27px] border-[#edf2f7] text-center text-xs text-[#687a92]">Sem processos</div>;
  }

  const data: ChartData<"doughnut"> = {
    labels: visibleStatuses.map((status) => status.label),
    datasets: [{
      data: visibleStatuses.map((status) => status.count),
      backgroundColor: visibleStatuses.map((status) => status.color),
      borderColor: "#ffffff",
      borderWidth: 2,
      hoverOffset: 4,
    }],
  };

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    cutout: "68%",
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#070e1d",
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (context) => {
            const count = Number(context.raw);
            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
            return `${context.label}: ${numberFormatter.format(count)} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="relative size-[168px]">
      <Doughnut
        data={data}
        options={options}
        role="img"
        aria-label={`Distribuição de ${numberFormatter.format(total)} processos por status.`}
      />
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center" aria-hidden="true">
        <div>
          <p className="text-[27px] font-bold leading-none tracking-[-0.04em] text-[#111a2d]">{numberFormatter.format(total)}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#91a2b9]">Processos</p>
        </div>
      </div>
    </div>
  );
}
