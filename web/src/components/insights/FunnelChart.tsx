import { Filter } from "lucide-react";
import type { FunnelStage } from "@/lib/insights/compute";
import InsightsSection, { EmptyState } from "./InsightsSection";

const BAR: Record<string, string> = {
  coletadas: "bg-slate-300",
  pontuadas: "bg-indigo-300",
  n60: "bg-indigo-400",
  n70: "bg-indigo-500",
  curriculo: "bg-emerald-500",
  aplicadas: "bg-sky-500",
  entrevista: "bg-amber-500",
  oferta: "bg-rose-500",
};

export default function FunnelChart({ stages, periodLabel }: { stages: FunnelStage[]; periodLabel: string }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const overBase = stages.find((s) => s.overBase);

  return (
    <InsightsSection
      title="Funil"
      subtitle={`Vagas coletadas ${periodLabel} e até onde cada uma chegou. % = conversão sobre a etapa anterior.`}
      icon={<Filter className="h-4 w-4" />}
    >
      {stages[0].value === 0 ? (
        <EmptyState title="Nenhuma vaga coletada no período" />
      ) : (
        <ol className="space-y-2">
          {stages.map((s) => (
            <li key={s.key} className="grid grid-cols-[8.5rem_1fr_5.5rem] items-center gap-3 sm:grid-cols-[10rem_1fr_6.5rem]">
              <span className="truncate text-sm font-medium text-gray-700">{s.label}</span>
              <div className="h-6 overflow-hidden rounded-md bg-gray-50">
                <div
                  className={`flex h-full items-center rounded-md px-2 text-[11px] font-semibold text-white ${BAR[s.key] ?? "bg-indigo-400"}`}
                  style={{ width: `${s.value === 0 ? 0 : Math.max((s.value / max) * 100, 4)}%` }}
                  title={`${s.label}: ${s.value}`}
                >
                  {s.value > 0 && s.value / max > 0.08 ? s.value : null}
                </div>
              </div>
              <span className="flex items-center justify-end gap-2 text-right">
                <span className="text-sm font-semibold tabular-nums text-gray-900">{s.value}</span>
                <span
                  className="min-w-[3rem] rounded-full bg-gray-100 px-2 py-0.5 text-center text-[11px] font-medium tabular-nums text-gray-500"
                  title={s.baseLabel ? `sobre "${s.baseLabel}"` : undefined}
                >
                  {s.fromPrev == null || s.overBase ? "—" : `${s.fromPrev}%`}
                  {s.baseLabel && !s.overBase && s.fromPrev != null ? "*" : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
        * Currículo gerado é medido sobre &quot;Nota ≥ 60&quot;, o corte usado pelo rodar-ia.
        {overBase &&
          ` Neste período há mais currículos (${overBase.value}) do que vagas na base: algum currículo é de vaga que caiu abaixo do corte no rescore ou foi gerado manualmente.`}
      </p>
    </InsightsSection>
  );
}
