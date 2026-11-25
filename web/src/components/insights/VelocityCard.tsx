import { Timer } from "lucide-react";
import type { Velocity } from "@/lib/insights/compute";
import InsightsSection, { EmptyState } from "./InsightsSection";

function formatDays(d: number): string {
  if (d < 1) {
    const hours = d * 24;
    return hours < 1 ? "< 1 h" : `${Math.round(hours)} h`;
  }
  const v = Math.round(d * 10) / 10;
  return `${v.toLocaleString("pt-BR")} ${v === 1 ? "dia" : "dias"}`;
}

export default function VelocityCard({ velocity, periodLabel }: { velocity: Velocity; periodLabel: string }) {
  const max = Math.max(...velocity.faixas.map((f) => f.value), 1);

  return (
    <InsightsSection
      title="Velocidade"
      subtitle={`Tempo entre a coleta da vaga e a candidatura (vagas coletadas ${periodLabel}).`}
      icon={<Timer className="h-4 w-4" />}
    >
      {velocity.mediana == null ? (
        <EmptyState title="Nenhuma candidatura no período" text="Marque vagas como applied para medir a velocidade." />
      ) : (
        <>
          <div className="flex items-end gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Mediana</p>
              <p className="text-3xl font-bold tabular-nums text-gray-900">{formatDays(velocity.mediana)}</p>
            </div>
            <div className="pb-1 text-xs text-gray-500">
              {velocity.n} {velocity.n === 1 ? "candidatura" : "candidaturas"}
              {velocity.n > 1 && velocity.min != null && velocity.max != null && (
                <> · de {formatDays(velocity.min)} a {formatDays(velocity.max)}</>
              )}
            </div>
          </div>
          <ul className="mt-5 space-y-2">
            {velocity.faixas.map((f) => (
              <li key={f.label} className="grid grid-cols-[5rem_1fr_2rem] items-center gap-3">
                <span className="text-xs text-gray-600">{f.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${(f.value / max) * 100}%` }} />
                </div>
                <span className="text-right text-xs font-semibold tabular-nums text-gray-700">{f.value}</span>
              </li>
            ))}
          </ul>
          {velocity.n < 5 && (
            <p className="mt-4 text-[11px] text-gray-400">Poucas candidaturas ainda: a mediana vai ficar confiável com mais dados.</p>
          )}
        </>
      )}
    </InsightsSection>
  );
}
