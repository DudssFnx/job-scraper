import { Search, AlertTriangle } from "lucide-react";
import { REMOTEOK_TERM, UNKNOWN_TERM, type TermRow } from "@/lib/insights/compute";
import InsightsSection, { EmptyState } from "./InsightsSection";

export default function TermsTable({ rows, periodLabel }: { rows: TermRow[]; periodLabel: string }) {
  const maxAvg = 100;
  const low = rows.filter((r) => r.baixo);

  return (
    <InsightsSection
      title="Por termo de busca"
      subtitle={`Vagas coletadas ${periodLabel}. Frente e termo são reconstruídos a partir do log de cada scrape (o scraper não os grava na vaga).`}
      icon={<Search className="h-4 w-4" />}
      aside={
        low.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {low.length} {low.length === 1 ? "termo" : "termos"} com menos de 10% ≥ 70
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="Sem vagas no período" />
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-2 pb-2">Frente</th>
                <th className="px-2 pb-2">Termo</th>
                <th className="px-2 pb-2 text-right">Vagas</th>
                <th className="w-44 px-2 pb-2">Nota média</th>
                <th className="whitespace-nowrap px-2 pb-2 text-right">% ≥ 70</th>
                <th className="px-2 pb-2 text-right">Aplicadas</th>
                <th className="px-2 pb-2 text-right">Entrevistas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={`${r.front}|${r.term}`} className={r.baixo ? "bg-amber-50/60" : undefined}>
                  <td className="whitespace-nowrap px-2 py-2.5 text-xs text-gray-500">{r.front}</td>
                  <td className="px-2 py-2.5">
                    <span className={`font-medium ${r.configurado ? "text-gray-800" : "text-gray-500"}`}>{r.term}</span>
                    {!r.configurado && r.vagas > 0 && r.term !== REMOTEOK_TERM && r.term !== UNKNOWN_TERM && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">fora da config. atual</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{r.vagas}</td>
                  <td className="px-2 py-2.5">
                    {r.notaMedia == null ? (
                      <span className="text-xs text-gray-400">não pontuadas</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(r.notaMedia / maxAvg) * 100}%` }} />
                        </div>
                        <span className="w-7 text-right text-xs font-semibold tabular-nums text-gray-700">{r.notaMedia}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {r.pct70 == null ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span className={r.baixo ? "font-semibold text-amber-700" : "text-gray-700"}>
                        {r.pct70}%
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{r.aplicadas}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{r.entrevistas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-400">
        % ≥ 70 é calculado sobre as vagas pontuadas do termo. Linhas em amarelo: menos de 10% das vagas chegam a 70.
      </p>
    </InsightsSection>
  );
}
