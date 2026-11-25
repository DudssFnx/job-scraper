import { Bot } from "lucide-react";
import type { AutomationDay } from "@/lib/insights/compute";
import InsightsSection from "./InsightsSection";

const SERIES = [
  { key: "coletadas", label: "Coletadas", color: "bg-slate-300" },
  { key: "pontuadas", label: "Pontuadas", color: "bg-indigo-400" },
  { key: "curriculos", label: "Currículos", color: "bg-emerald-500" },
] as const;

const COUNTERS = [
  { key: "falhas", label: "Falhas", alert: true },
  { key: "repaired", label: "JSON reparado", alert: false },
  { key: "retry", label: "Retry (fact-check)", alert: false },
  { key: "fallback", label: "Fallback", alert: true },
  { key: "omitted", label: "Resumo omitido", alert: true },
] as const;

const fmt = (date: string) => {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
};

export default function AutomationChart({ days, logsAvailable }: { days: AutomationDay[]; logsAvailable: boolean }) {
  const max = Math.max(...days.flatMap((d) => [d.coletadas, d.pontuadas, d.curriculos]), 1);
  const totals = SERIES.map((s) => ({ ...s, total: days.reduce((acc, d) => acc + d[s.key], 0) }));

  return (
    <InsightsSection
      title="Automação por dia"
      subtitle="Últimos 14 dias (horário de São Paulo). Pontuadas vêm da telemetria; contadores vêm de logs\ia-*.log."
      icon={<Bot className="h-4 w-4" />}
      aside={
        <div className="flex flex-wrap gap-3">
          {totals.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />
              {s.label} <span className="font-semibold tabular-nums text-gray-900">{s.total}</span>
            </span>
          ))}
        </div>
      }
    >
      <div className="flex h-40 items-end gap-1.5 sm:gap-2">
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center gap-[2px]">
            <span className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              {fmt(d.date)} · {d.coletadas} coletadas · {d.pontuadas} pontuadas · {d.curriculos} currículos
            </span>
            {SERIES.map((s) => {
              const v = d[s.key];
              return (
                <div
                  key={s.key}
                  className={`w-full max-w-[12px] rounded-t-sm ${v > 0 ? s.color : "bg-gray-100"}`}
                  style={{ height: v > 0 ? `${Math.max((v / max) * 100, 4)}%` : "3px" }}
                  aria-label={`${fmt(d.date)} ${s.label}: ${v}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-2">
        {days.map((d) => (
          <span key={d.date} className="flex-1 text-center text-[10px] tabular-nums text-gray-400">
            {fmt(d.date)}
          </span>
        ))}
      </div>

      <div className="-mx-2 mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-2 pb-2">Log da IA</th>
              {days.map((d) => (
                <th key={d.date} className="px-1 pb-2 text-center font-medium normal-case tracking-normal">
                  {fmt(d.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {COUNTERS.map((c) => (
              <tr key={c.key}>
                <td className="whitespace-nowrap px-2 py-1.5 text-gray-600">{c.label}</td>
                {days.map((d) => {
                  const v = d[c.key];
                  return (
                    <td key={d.date} className="px-1 py-1.5 text-center tabular-nums">
                      {!d.temLog || v == null ? (
                        <span className="text-gray-200">·</span>
                      ) : v === 0 ? (
                        <span className="text-gray-300">0</span>
                      ) : (
                        <span
                          className={`inline-block min-w-[1.5rem] rounded px-1 font-semibold ${
                            c.alert ? "bg-rose-50 text-rose-700" : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {v}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
        {logsAvailable
          ? "· = sem log local nesse dia (o rodar-ia não rodou neste PC). Falhas usam o mesmo critério do resumo do rodar-ia."
          : "Pasta de logs não encontrada (esperada em C:\\dev\\jobtrack\\logs). Os contadores só aparecem rodando o app neste PC."}
      </p>
    </InsightsSection>
  );
}
