import { BarChart3 } from "lucide-react";
import {
  PERIODS,
  computeAutomation,
  computeFunnel,
  computeSkillGaps,
  computeTerms,
  computeVelocity,
  filterByPeriod,
  isScored,
  mapJobsToTerms,
  type PeriodKey,
} from "@/lib/insights/compute";
import {
  getConfiguredSearchTerms,
  getCustomizedResumeDates,
  getIaLogCounters,
  getInsightJobs,
  getRunMetricsSince,
  getScrapeRunLogs,
} from "@/lib/insights/queries";
import PeriodTabs from "@/components/insights/PeriodTabs";
import FunnelChart from "@/components/insights/FunnelChart";
import TermsTable from "@/components/insights/TermsTable";
import StudyGaps from "@/components/insights/StudyGaps";
import AutomationChart from "@/components/insights/AutomationChart";
import VelocityCard from "@/components/insights/VelocityCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights · JobTrack" };

const AUTOMATION_DAYS = 14;
const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
  tudo: "desde o início",
};

export default async function InsightsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = params?.periodo;
  const period: PeriodKey = typeof raw === "string" && raw in PERIODS ? (raw as PeriodKey) : "30d";
  const periodLabel = PERIOD_LABEL[period];

  const since = new Date(Date.now() - AUTOMATION_DAYS * 86_400_000).toISOString();
  let loadError: string | null = null;
  const [jobs, resumeDates, scrapeLogs, runMetrics, terms, logs] = await Promise.all([
    getInsightJobs().catch((e) => ((loadError = String(e?.message || e)), [])),
    getCustomizedResumeDates().catch(() => [] as string[]),
    getScrapeRunLogs().catch(() => []),
    getRunMetricsSince(since).catch(() => []),
    getConfiguredSearchTerms().catch(() => [] as string[]),
    getIaLogCounters(AUTOMATION_DAYS).catch(() => null),
  ]);

  const periodJobs = filterByPeriod(jobs, period);
  const funnel = computeFunnel(periodJobs);
  const termRows = computeTerms(periodJobs, mapJobsToTerms(scrapeLogs), terms);
  const gaps = computeSkillGaps(periodJobs);
  const automation = computeAutomation(jobs, resumeDates, runMetrics, logs ?? new Map(), AUTOMATION_DAYS);
  const velocity = computeVelocity(periodJobs);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex rounded-xl bg-indigo-600 p-2 text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Insights</h1>
            <p className="text-sm text-gray-500">Como está a busca: funil, termos, lacunas, automação e velocidade.</p>
          </div>
        </div>
        <PeriodTabs current={period} />
      </header>

      {loadError && (
        <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não foi possível ler as vagas do Supabase: {loadError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <FunnelChart stages={funnel} periodLabel={periodLabel} />
        </div>
        <div className="lg:col-span-2">
          <VelocityCard velocity={velocity} periodLabel={periodLabel} />
        </div>
        <div className="lg:col-span-3">
          <TermsTable rows={termRows} periodLabel={periodLabel} />
        </div>
        <div className="lg:col-span-2">
          <StudyGaps rows={gaps} scoredCount={periodJobs.filter(isScored).length} periodLabel={periodLabel} />
        </div>
        <div className="lg:col-span-5">
          <AutomationChart days={automation} logsAvailable={logs != null} />
        </div>
      </div>
    </div>
  );
}
