// Cálculos puros da página /insights (sem Next.js, sem Supabase), para poderem
// ser testados com tsx. As leituras ficam em ./queries.ts.

export const TZ = "America/Sao_Paulo";

export interface InsightJob {
  job_id: string;
  provider: string | null;
  status: string | null;
  resume_score: number | null;
  scraped_at: string | null;
  application_date: string | null;
  customized_resume_id: string | null;
  status_history: { from?: string | null; to: string; at: string }[] | null;
  score_breakdown: { skill_gaps?: unknown } | null;
}

export interface ScrapeRunLog {
  started_at: string;
  log_output: string | null;
}

export interface RunMetrics {
  workflow_id: string;
  started_at: string;
  metrics: Record<string, unknown> | null;
}

export const PERIODS = { "7d": 7, "30d": 30, tudo: null } as const;
export type PeriodKey = keyof typeof PERIODS;

const APPLIED_STATUSES = new Set(["applied", "interviewing", "offer", "rejected"]);
const INTERVIEW_STATUSES = new Set(["interviewing", "offer"]);

/** YYYY-MM-DD no fuso de São Paulo. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function lastNDays(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  return out;
}

export function filterByPeriod(jobs: InsightJob[], period: PeriodKey, now = new Date()): InsightJob[] {
  const days = PERIODS[period];
  if (days == null) return jobs;
  const since = now.getTime() - days * 86_400_000;
  return jobs.filter((j) => j.scraped_at && new Date(j.scraped_at).getTime() >= since);
}

const historyHas = (j: InsightJob, set: Set<string>) => (j.status_history || []).some((h) => set.has(h?.to));

export const isScored = (j: InsightJob) => j.resume_score != null;
export const isApplied = (j: InsightJob) =>
  Boolean(j.application_date) || APPLIED_STATUSES.has(j.status || "") || historyHas(j, APPLIED_STATUSES);
export const isInterview = (j: InsightJob) => INTERVIEW_STATUSES.has(j.status || "") || historyHas(j, INTERVIEW_STATUSES);
export const isOffer = (j: InsightJob) => j.status === "offer" || historyHas(j, new Set(["offer"]));

// ---------------------------------------------------------------- 1. Funil
export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  /** % em relação à etapa de base (null na primeira ou quando a base é 0) */
  fromPrev: number | null;
  /** Rótulo da etapa usada como base da %, quando não é a imediatamente anterior */
  baseLabel?: string;
  /** Etapa maior que a base (ex.: currículo de vaga que caiu abaixo de 60 após o rescore) */
  overBase: boolean;
}

export function computeFunnel(jobs: InsightJob[]): FunnelStage[] {
  // [key, label, filtro, índice da etapa base (padrão: a anterior)]
  const raw: [string, string, (j: InsightJob) => boolean, number?][] = [
    ["coletadas", "Coletadas", () => true],
    ["pontuadas", "Pontuadas", isScored],
    ["n60", "Nota ≥ 60", (j) => (j.resume_score ?? -1) >= 60],
    ["n70", "Nota ≥ 70", (j) => (j.resume_score ?? -1) >= 70],
    // O rodar-ia gera currículo a partir da nota 60, então a base é "Nota ≥ 60".
    ["curriculo", "Currículo gerado", (j) => Boolean(j.customized_resume_id), 2],
    ["aplicadas", "Aplicadas", isApplied],
    ["entrevista", "Entrevista", isInterview],
    ["oferta", "Oferta", isOffer],
  ];
  const values = raw.map(([, , f]) => jobs.filter(f).length);
  return raw.map(([key, label, , base], i) => {
    const b = base ?? i - 1;
    const pct = i === 0 || values[b] === 0 ? null : Math.round((values[i] / values[b]) * 100);
    return {
      key,
      label,
      value: values[i],
      fromPrev: pct,
      overBase: pct != null && pct > 100,
      baseLabel: base != null ? raw[base][1] : undefined,
    };
  });
}

// ---------------------------------------------------------------- 2. Termos
export const UNKNOWN_TERM = "Não identificado";
export const REMOTEOK_TERM = "RemoteOK (feed, sem termo)";
export const LEGACY_FRONT = "São Paulo (antes das frentes)";
export const REMOTEOK_FRONT = "RemoteOK";
export const UNKNOWN_FRONT = "Não identificada";

export interface JobOrigin {
  term: string;
  front: string;
}

/**
 * O scraper não grava termo nem frente na vaga. Reconstrói a origem a partir da telemetria
 * de cada scrape (automation_runs.log_output): a última linha "[Frente] <nome> | local ..." e a
 * última URL com `keywords=` antes de "job ID: <id>" dizem de onde a vaga veio. Scrapes
 * anteriores às frentes ficam como LEGACY_FRONT. Primeira atribuição vence.
 */
export function mapJobsToOrigins(runs: ScrapeRunLog[]): Map<string, JobOrigin> {
  const map = new Map<string, JobOrigin>();
  const sorted = [...runs].sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const run of sorted) {
    let term: string | null = null;
    let front: string = LEGACY_FRONT;
    for (const line of (run.log_output || "").split("\n")) {
      const fr = line.match(/\[Frente\] (.+?) \| local "/);
      if (fr) front = fr[1].trim();
      const kw = line.match(/[?&]keywords=([^&\s]+)/);
      if (kw) {
        try {
          term = decodeURIComponent(kw[1].replace(/\+/g, " ")).trim();
        } catch {
          term = kw[1];
        }
      }
      const id = line.match(/job ID: (\d+)/);
      if (id && term && !map.has(id[1])) map.set(id[1], { term, front });
    }
  }
  return map;
}

/** Compatibilidade: só o termo de cada vaga. */
export function mapJobsToTerms(runs: ScrapeRunLog[]): Map<string, string> {
  return new Map([...mapJobsToOrigins(runs)].map(([id, o]) => [id, o.term]));
}

export function originOf(job: InsightJob, origins: Map<string, JobOrigin>): JobOrigin {
  return (
    origins.get(job.job_id) ??
    (job.provider === "remote_ok" ? { term: REMOTEOK_TERM, front: REMOTEOK_FRONT } : { term: UNKNOWN_TERM, front: UNKNOWN_FRONT })
  );
}

export interface ConfiguredTerm {
  front: string;
  term: string;
}

export interface FrontFunnelRow {
  front: string;
  stages: FunnelStage[];
}

/** Funil por frente (mesmas etapas do funil geral). */
export function computeFunnelByFront(jobs: InsightJob[], origins: Map<string, JobOrigin>): FrontFunnelRow[] {
  const groups = new Map<string, InsightJob[]>();
  for (const j of jobs) {
    const f = originOf(j, origins).front;
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f)!.push(j);
  }
  return [...groups.entries()]
    .map(([front, list]) => ({ front, stages: computeFunnel(list) }))
    .sort((a, b) => b.stages[0].value - a.stages[0].value || a.front.localeCompare(b.front));
}

export interface TermRow {
  front: string;
  term: string;
  vagas: number;
  pontuadas: number;
  notaMedia: number | null;
  pct70: number | null;
  aplicadas: number;
  entrevistas: number;
  baixo: boolean;
  configurado: boolean;
}

export function computeTerms(jobs: InsightJob[], origins: Map<string, JobOrigin>, configuredTerms: ConfiguredTerm[]): TermRow[] {
  const key = (front: string, term: string) => `${front}\u0000${term}`;
  const groups = new Map<string, { front: string; term: string; list: InsightJob[] }>();
  for (const c of configuredTerms) groups.set(key(c.front, c.term), { ...c, list: [] });
  for (const j of jobs) {
    const o = originOf(j, origins);
    const k = key(o.front, o.term);
    if (!groups.has(k)) groups.set(k, { front: o.front, term: o.term, list: [] });
    groups.get(k)!.list.push(j);
  }
  const configured = new Set(configuredTerms.map((c) => key(c.front, c.term)));
  const rows: TermRow[] = [];
  for (const [k, { front, term, list }] of groups) {
    const scored = list.filter(isScored);
    const n70 = scored.filter((j) => (j.resume_score ?? 0) >= 70).length;
    const pct70 = scored.length ? Math.round((n70 / scored.length) * 100) : null;
    rows.push({
      front,
      term,
      vagas: list.length,
      pontuadas: scored.length,
      notaMedia: scored.length ? Math.round(scored.reduce((s, j) => s + (j.resume_score ?? 0), 0) / scored.length) : null,
      pct70,
      aplicadas: list.filter(isApplied).length,
      entrevistas: list.filter(isInterview).length,
      baixo: pct70 != null && pct70 < 10,
      configurado: configured.has(k),
    });
  }
  return rows
    .filter((r) => r.vagas > 0 || r.configurado)
    .sort((a, b) => a.front.localeCompare(b.front) || b.vagas - a.vagas || a.term.localeCompare(b.term));
}

// ---------------------------------------------------------------- 3. O que estudar
export interface SkillGapRow {
  label: string;
  vagas: number;
  exemplos: string[];
}

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Cabeça da lacuna, sem detalhes entre parênteses / após dois-pontos ou travessão. */
function gapHead(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .split(/[:;]| - | — | – /)[0]
    .replace(/\b(nao|não) (evidenciad[oa]|mencionad[oa]|utilizad[oa] profissionalmente)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.,\s]+$/, "")
    .trim();
}

function gapKey(head: string): string {
  return stripAccents(head.toLowerCase())
    .replace(/\b(experiencia|conhecimento|vivencia|familiaridade|dominio|nocoes|solida|solido|com|em|de|do|da|e)\b/g, " ")
    .replace(/[^a-z0-9+#./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Temas de estudo. As lacunas do score são frases livres ("CI/CD (Jenkins, Sonar)",
 * "Inglês apenas básico a intermediário"...), então agrupamos por tema. Testado
 * contra o texto sem acentos e em minúsculas. Uma lacuna pode cair em mais de um tema.
 */
const STUDY_TOPICS: [string, RegExp][] = [
  ["Inglês", /\bingles\b|\benglish\b/],
  ["Espanhol", /espanhol|spanish/],
  ["Angular", /\bangular\b/],
  ["Java / Spring", /\bjava\b(?!script)|\bspring\b/],
  ["C# / .NET", /c#|\.net\b|asp\.net/],
  ["PHP / Laravel", /\bphp\b|laravel/],
  ["Next.js", /next\.?js/],
  ["Vue.js", /\bvue/],
  ["Node.js (uso profissional)", /node\.?js/],
  ["Python avançado", /\bpython\b/],
  ["Testes automatizados", /\btest|junit|mockito|\bjest\b|cypress|\btdd\b|pytest|playwright|selenium|appium|jasmine|\be2e\b/],
  ["CI/CD", /ci\/cd|pipeline|jenkins|github actions|azure devops|bamboo|esteira|argocd/],
  ["Docker / Kubernetes", /kubernetes|\bk8s\b|docker|\beks\b/],
  ["Infraestrutura como código", /terraform|infraestrutura como codigo|\biac\b|cloudformation/],
  ["Observabilidade / monitoramento", /observab|monitor|grafana|kibana|\belk\b|dynatrace|opentelemetry|jaeger|application insights/],
  ["Mensageria (Kafka / RabbitMQ)", /kafka|rabbitmq|mensageria|service bus|\bsqs\b|celery|mqtt/],
  ["NoSQL (MongoDB / Redis)", /nosql|nao relaciona|mongodb|redis|cosmos|hbase/],
  ["Bancos corporativos (Oracle / SQL Server / DB2)", /oracle|sql server|\bdb2\b/],
  ["Microsserviços / sistemas distribuídos", /micro ?servi|microservices|distribu|\bsoa\b/],
  ["Arquitetura (DDD / Clean / Hexagonal)", /\bddd\b|domain-driven|clean architecture|clean code|codigo limpo|hexagonal/],
  ["IA generativa (LLMs, RAG, agentes)", /\bllms?\b|\brag\b|agentic|\bagents?\b|agentes|langchain|langgraph|ia generativa|engenharia de prompt|\bmcp\b|copilot|embeddings|\bnlp\b/],
  ["Metodologias ágeis (Scrum / Kanban)", /\bageis\b|\bagil\b|agile|scrum|kanban/],
  ["Jira / gestão de projetos", /\bjira\b|confluence|monday|ms project/],
  ["Design System / componentes", /design system|storybook|material ui/],
  ["GraphQL", /graphql/],
  ["Gerenciamento de estado (Redux / Zustand)", /redux|zustand/],
  ["Micro front-end", /micro front|federation/],
  ["API Management / API Gateway", /api management|apigee|\bkong\b|api gateway/],
  ["Code review / Git em equipe", /code review|revisao de codigo|pull request|git ?flow/],
  ["Requisitos e processos (BPMN)", /requisitos|bpmn|as-is|especificac|bizagi/],
  ["Certificações", /certifica/],
  ["Power Platform / Microsoft 365", /power automate|power apps|dataverse|microsoft 365/],
  ["Mobile (Android / iOS)", /mobile|android|\bios\b/],
  ["Dados / ML", /machine learning|ciencia de dados|data warehouse|lakehouse|bigquery|estatistica/],
];

const CLOUDS: [string, RegExp][] = [
  ["AWS", /\baws\b|amazon|lambda|cloudwatch/],
  ["Azure", /azure/],
  ["GCP", /\bgcp\b|google cloud/],
];
const GENERIC_CLOUD = /cloud|nuvem|serverless/;

/** Lacunas que não se resolvem estudando: senioridade, local, formação, setor, cliente. */
const NOT_STUDY =
  /senior|senioridade|anos de|years|\bnivel\b|mid-senior|lideranca|tech lead|mentoria|presencial|disponibilidade|reside|viagem|travel|bacharelado|formacao|graduac|setor|telecom|fintech|financeir|bancari|consultoria|consulting|client|clientes externos|grande porte|larga escala|ambiente corporativo/;

function gapTopics(raw: string): string[] {
  const t = stripAccents(raw.toLowerCase());
  const topics = STUDY_TOPICS.filter(([, re]) => re.test(t)).map(([label]) => label);
  const clouds = CLOUDS.filter(([, re]) => re.test(t)).map(([label]) => label);
  if (clouds.length === 1) topics.push(clouds[0]);
  else if (clouds.length > 1 || GENERIC_CLOUD.test(t)) topics.push("Cloud pública (AWS / Azure / GCP)");
  return topics;
}

export function computeSkillGaps(jobs: InsightJob[], limit = 15): SkillGapRow[] {
  const groups = new Map<string, { labels: Map<string, number>; jobs: Set<string>; raws: Set<string> }>();
  const add = (key: string, label: string, jobId: string, raw: string) => {
    if (!groups.has(key)) groups.set(key, { labels: new Map(), jobs: new Set(), raws: new Set() });
    const grp = groups.get(key)!;
    grp.labels.set(label, (grp.labels.get(label) || 0) + 1);
    grp.jobs.add(jobId);
    grp.raws.add(raw);
  };
  for (const j of jobs) {
    const gaps = j.score_breakdown?.skill_gaps;
    if (!Array.isArray(gaps)) continue;
    for (const g of gaps) {
      if (typeof g !== "string" || !g.trim()) continue;
      const raw = g.trim();
      const topics = gapTopics(raw);
      if (topics.length) {
        for (const topic of topics) add(`topic:${topic}`, topic, j.job_id, raw);
        continue;
      }
      if (NOT_STUDY.test(stripAccents(raw.toLowerCase()))) continue;
      const head = gapHead(raw);
      const key = gapKey(head);
      if (key) add(`head:${key}`, head, j.job_id, raw);
    }
  }
  return [...groups.values()]
    .map((g) => ({
      label: [...g.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0],
      vagas: g.jobs.size,
      exemplos: [...g.raws].slice(0, 3),
    }))
    .sort((a, b) => b.vagas - a.vagas || a.label.localeCompare(b.label))
    .slice(0, limit);
}

// ---------------------------------------------------------------- 4. Automação
export interface LogCounters {
  falhas: number;
  repaired: number;
  retry: number;
  fallback: number;
  omitted: number;
}

export interface AutomationDay extends Partial<LogCounters> {
  date: string;
  coletadas: number;
  pontuadas: number;
  curriculos: number;
  temLog: boolean;
}

const sumMatches = (text: string, re: RegExp) => {
  let s = 0;
  for (const m of text.matchAll(re)) s += Number(m[1]) || 0;
  return s;
};
const countMatches = (text: string, re: RegExp) => (text.match(re) || []).length;

/** Mesmos critérios do resumo do rodar-ia.bat. */
export function parseIaLog(text: string): LogCounters {
  return {
    falhas: sumMatches(text, /Failed \/ Skipped: (\d+)/g) + sumMatches(text, /Successfully tailored: \d+ \| Failed: (\d+)/g),
    repaired: countMatches(text, /\[claude_cli\] JSON response [^\r\n]*repaired\./g),
    retry: countMatches(text, /\[fact-check\] retry:/g),
    fallback: countMatches(text, /\[fact-check\] fallback /g),
    omitted: countMatches(text, /\[fact-check\] summary omitted/g),
  };
}

export function computeAutomation(
  jobs: InsightJob[],
  resumeDates: string[],
  runs: RunMetrics[],
  logs: Map<string, LogCounters>,
  days = 14,
  now = new Date(),
): AutomationDay[] {
  const keys = lastNDays(days, now);
  const rows = new Map<string, AutomationDay>(
    keys.map((k) => [k, { date: k, coletadas: 0, pontuadas: 0, curriculos: 0, temLog: false }]),
  );
  for (const j of jobs) if (j.scraped_at) { const r = rows.get(dayKey(j.scraped_at)); if (r) r.coletadas++; }
  for (const d of resumeDates) { const r = rows.get(dayKey(d)); if (r) r.curriculos++; }
  for (const run of runs) {
    if (run.workflow_id !== "score_jobs") continue;
    const r = rows.get(dayKey(run.started_at));
    if (r) r.pontuadas += Number(run.metrics?.successful_scores) || 0;
  }
  for (const [date, c] of logs) {
    const r = rows.get(date);
    if (r) Object.assign(r, c, { temLog: true });
  }
  return keys.map((k) => rows.get(k)!);
}

// ---------------------------------------------------------------- 5. Velocidade
export interface Velocity {
  mediana: number | null;
  n: number;
  min: number | null;
  max: number | null;
  faixas: { label: string; value: number }[];
}

export function computeVelocity(jobs: InsightJob[]): Velocity {
  const diffs: number[] = [];
  for (const j of jobs) {
    const appliedAt =
      j.application_date || (j.status_history || []).find((h) => h?.to === "applied")?.at || null;
    if (!appliedAt || !j.scraped_at) continue;
    const d = (new Date(appliedAt).getTime() - new Date(j.scraped_at).getTime()) / 86_400_000;
    if (Number.isFinite(d)) diffs.push(Math.max(0, d));
  }
  diffs.sort((a, b) => a - b);
  const n = diffs.length;
  const mediana = n === 0 ? null : n % 2 ? diffs[(n - 1) / 2] : (diffs[n / 2 - 1] + diffs[n / 2]) / 2;
  const faixas = [
    { label: "< 1 dia", test: (d: number) => d < 1 },
    { label: "1–2 dias", test: (d: number) => d >= 1 && d < 3 },
    { label: "3–7 dias", test: (d: number) => d >= 3 && d < 8 },
    { label: "> 7 dias", test: (d: number) => d >= 8 },
  ].map((f) => ({ label: f.label, value: diffs.filter(f.test).length }));
  return { mediana, n, min: n ? diffs[0] : null, max: n ? diffs[n - 1] : null, faixas };
}
