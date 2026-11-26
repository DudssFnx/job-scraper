// Title pre-filter for LinkedIn Phase 1 candidates: drops cards whose title already shows the job
// does not fit (seniority, language, off-target stack) BEFORE the per-query limit is applied, so the
// daily quota is spent on jobs worth fetching. Lists are editable in app_settings
// (scrape_title_exclude / scrape_title_exclude_stack); NULL there means "use the defaults below".
import type { CandidateJob } from "./types";

export const DEFAULT_TITLE_EXCLUDE = [
  "senior", "sênior", "sr.", "sr", "staff", "principal", "lead", "líder", "head",
  "especialista", "gerente", "manager", "coordenador", "arquiteto", "architect", "director", "diretor",
  "french", "francês", "français", "german", "alemão", "deutsch", "dutch",
];

export const DEFAULT_TITLE_EXCLUDE_STACK = ["java", ".net", "c#", "golang", "(go)", "angular", "php"];

/** A stack term only excludes the title when none of these also appears in it. */
export const STACK_ALLOW_TERMS = ["react", "node", "typescript", "javascript", "python", "next", "nodejs", "reactjs", "nextjs"];

export interface TitleFilterRules {
  exclude: string[];
  excludeStack: string[];
}

export type TitleFilterRule = "titulo" | "stack";

export interface TitleFilterResult {
  kept: CandidateJob[];
  skipped: { candidate: CandidateJob; rule: TitleFilterRule; term: string }[];
}

/** Lowercase, accents removed. */
export function normalizeTitle(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const isAlnum = (ch: string | undefined) => !!ch && /[a-z0-9]/.test(ch);

/**
 * Whole-word match on normalized text. A side of the term only needs a boundary when the term
 * starts/ends with a letter or digit there, so "sr.", ".net", "c#" and "(go)" work as written
 * ("java" does not match "javascript"; ".net" matches "asp.net").
 */
export function hasTerm(normalizedTitle: string, term: string): boolean {
  const t = normalizeTitle(term.trim());
  if (!t) return false;
  let from = 0;
  while (true) {
    const i = normalizedTitle.indexOf(t, from);
    if (i < 0) return false;
    const okBefore = !isAlnum(t[0]) || !isAlnum(normalizedTitle[i - 1]);
    const okAfter = !isAlnum(t[t.length - 1]) || !isAlnum(normalizedTitle[i + t.length]);
    if (okBefore && okAfter) return true;
    from = i + 1;
  }
}

/** Returns why a title should be skipped, or null to keep it. */
export function titleExclusion(title: string, rules: TitleFilterRules): { rule: TitleFilterRule; term: string } | null {
  const n = normalizeTitle(title);
  const term = rules.exclude.find((x) => hasTerm(n, x));
  if (term) return { rule: "titulo", term };
  const stack = rules.excludeStack.find((x) => hasTerm(n, x));
  if (stack && !STACK_ALLOW_TERMS.some((x) => hasTerm(n, x))) return { rule: "stack", term: stack };
  return null;
}

export function filterCandidatesByTitle(candidates: CandidateJob[], rules: TitleFilterRules): TitleFilterResult {
  const kept: CandidateJob[] = [];
  const skipped: TitleFilterResult["skipped"] = [];
  for (const c of candidates) {
    const hit = c.job_title ? titleExclusion(c.job_title, rules) : null;
    if (hit) {
      skipped.push({ candidate: c, ...hit });
      continue;
    }
    kept.push(c);
  }
  return { kept, skipped };
}

/** Reads a text[] column from app_settings; null/absent -> defaults, [] -> rule disabled. */
export function resolveTermList(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

// Run-wide counters, printed once at the end of the LinkedIn scrape.
const runStats: Record<TitleFilterRule, number> = { titulo: 0, stack: 0 };
const runTerms = new Map<string, number>();

export function recordTitleFilterSkips(skipped: TitleFilterResult["skipped"]): void {
  for (const s of skipped) {
    runStats[s.rule]++;
    const k = `${s.rule}: ${s.term}`;
    runTerms.set(k, (runTerms.get(k) ?? 0) + 1);
  }
}

export function titleFilterSummary(): string {
  const total = runStats.titulo + runStats.stack;
  const lines = [
    `[Filtro] Resumo do lote: ${total} pulada(s) | titulo (senioridade/idioma/cargo): ${runStats.titulo} | stack: ${runStats.stack}`,
  ];
  for (const [k, v] of [...runTerms.entries()].sort((a, b) => b[1] - a[1])) lines.push(`  - ${k}: ${v}`);
  return lines.join("\n");
}
