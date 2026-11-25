import { GraduationCap } from "lucide-react";
import type { SkillGapRow } from "@/lib/insights/compute";
import InsightsSection, { EmptyState } from "./InsightsSection";

export default function StudyGaps({ rows, scoredCount, periodLabel }: { rows: SkillGapRow[]; scoredCount: number; periodLabel: string }) {
  const max = Math.max(...rows.map((r) => r.vagas), 1);

  return (
    <InsightsSection
      title="O que estudar"
      subtitle={`As 15 lacunas mais frequentes nas ${scoredCount} vagas pontuadas ${periodLabel}, agrupadas por tema.`}
      icon={<GraduationCap className="h-4 w-4" />}
    >
      {rows.length === 0 ? (
        <EmptyState title="Sem lacunas registradas no período" />
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.label} className="group">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-gray-700">
                  <span className="mr-1.5 text-xs tabular-nums text-gray-400">{i + 1}.</span>
                  {r.label}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-600">
                  {r.vagas} {r.vagas === 1 ? "vaga" : "vagas"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-500" style={{ width: `${(r.vagas / max) * 100}%` }} />
              </div>
              <p className="mt-1 hidden text-[11px] leading-snug text-gray-400 group-hover:block">
                Ex.: {r.exemplos.join(" · ")}
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
        Lista para orientar estudos. Lacunas de senioridade, localização, formação e setor de atuação ficam de fora. Passe o
        mouse num item para ver exemplos do texto original.
      </p>
    </InsightsSection>
  );
}
