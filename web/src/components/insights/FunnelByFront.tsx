import { Layers } from "lucide-react";
import type { FrontFunnelRow } from "@/lib/insights/compute";
import InsightsSection, { EmptyState } from "./InsightsSection";

const COLS: { key: string; label: string }[] = [
  { key: "coletadas", label: "Coletadas" },
  { key: "pontuadas", label: "Pontuadas" },
  { key: "n60", label: "≥ 60" },
  { key: "n70", label: "≥ 70" },
  { key: "curriculo", label: "Currículo" },
  { key: "aplicadas", label: "Aplicadas" },
  { key: "entrevista", label: "Entrevista" },
  { key: "oferta", label: "Oferta" },
];

/** Funil por frente: mesmas etapas do funil geral, uma linha por frente de busca. */
export default function FunnelByFront({ rows, periodLabel }: { rows: FrontFunnelRow[]; periodLabel: string }) {
  return (
    <InsightsSection
      title="Funil por frente"
      subtitle={`Vagas coletadas ${periodLabel}, separadas pela frente de busca que as trouxe. % = conversão sobre a etapa anterior.`}
      icon={<Layers className="h-4 w-4" />}
    >
      {rows.length === 0 ? (
        <EmptyState title="Nenhuma vaga coletada no período" />
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-2 pb-2">Frente</th>
                {COLS.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-2 pb-2 text-right">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.front}>
                  <td className="whitespace-nowrap px-2 py-2.5 font-medium text-gray-800">{r.front}</td>
                  {COLS.map((c) => {
                    const st = r.stages.find((s) => s.key === c.key);
                    return (
                      <td key={c.key} className="px-2 py-2.5 text-right tabular-nums">
                        <span className={st && st.value > 0 ? "font-semibold text-gray-900" : "text-gray-300"}>{st?.value ?? 0}</span>
                        {st && st.fromPrev != null && !st.overBase && st.key !== "coletadas" && (
                          <span className="ml-1 text-[10px] text-gray-400">{st.fromPrev}%</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </InsightsSection>
  );
}
