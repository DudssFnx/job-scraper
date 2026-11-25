// Candidate eligibility for job scoring (server-only).
//
// The candidate's facts (work authorization, location, timezone, English level...) are personal,
// so they are NOT in the code: they live in a local, git-ignored JSON file
// (default: <repo>/candidate-constraints.local.json, override with JOBTRACK_CONSTRAINTS_FILE).
// Without the file, scoring behaves exactly as before.
import fs from "node:fs";
import path from "node:path";

export interface CandidateConstraints {
  /** Free-text facts shown to the model, e.g. { "Citizenship": "...", "Home base": "..." } */
  facts: Record<string, string>;
  /** Score caps applied in code after the model answers */
  caps?: { ineligible?: number; stretch?: number };
  /** Resume header lines per market (see lib/market-header.ts) */
  header?: MarketHeader;
}

export interface MarketHeader {
  /** Regex (case-insensitive) matching job locations in the candidate's home country, e.g. "brasil|brazil" */
  home_country_pattern: string;
  remote_en?: string;
  remote_pt?: string;
  relocation_en?: string;
  relocation_pt?: string;
}

export type EligibilityStatus = "eligible" | "ineligible" | "stretch";

export interface EligibilityResult {
  status: EligibilityStatus;
  reason: string;
}

const DEFAULT_CAPS = { ineligible: 30, stretch: 55 };
let cache: { file: string; mtimeMs: number; value: CandidateConstraints | null } | null = null;

function constraintsPath(): string | null {
  const override = process.env.JOBTRACK_CONSTRAINTS_FILE?.trim();
  const candidates = override
    ? [override]
    : [path.resolve(process.cwd(), "..", "candidate-constraints.local.json"), path.resolve(process.cwd(), "candidate-constraints.local.json")];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

export function loadCandidateConstraints(): CandidateConstraints | null {
  const file = constraintsPath();
  if (!file) return null;
  try {
    const { mtimeMs } = fs.statSync(file);
    if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.value;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const facts = raw && typeof raw.facts === "object" ? (raw.facts as Record<string, unknown>) : null;
    const value: CandidateConstraints | null =
      facts && Object.keys(facts).length
        ? {
            facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, String(v)])),
            caps: { ...DEFAULT_CAPS, ...(raw.caps || {}) },
            header: raw.header && typeof raw.header.home_country_pattern === "string" ? (raw.header as MarketHeader) : undefined,
          }
        : null;
    cache = { file, mtimeMs, value };
    return value;
  } catch (err) {
    console.warn(`[eligibility] Could not read ${file}:`, (err as Error).message);
    return null;
  }
}

function constraintsBlock(c: CandidateConstraints): string {
  const caps = { ...DEFAULT_CAPS, ...(c.caps || {}) };
  const facts = Object.entries(c.facts).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  return `
--- CANDIDATE CONSTRAINTS (verified facts; apply strictly) ---
${facts}
--- END CANDIDATE CONSTRAINTS ---

ELIGIBILITY RULES (decide BEFORE scoring):
1. "ineligible" when the job requires a work authorization, citizenship, permanent residency or security clearance the candidate does not have, or explicitly says it does not sponsor visas ("no sponsorship", "must be authorized to work in ...", "citizens only"). An on-site or hybrid role outside the candidate's country is only eligible when the posting offers visa sponsorship/relocation or does not mention work authorization at all (in that case add the red flag "Visa sponsorship not mentioned").
2. "ineligible" when a remote role is restricted to a region the candidate is not in ("US only", "EU only", "must reside in ...") or requires working hours/timezone incompatible with the candidate's timezone.
3. "stretch" when the job requires fluent, native, advanced or C1/C2 English (or another language) above the candidate's stated level. Do not apply this rule when English is only "a plus" or "intermediate".
4. Otherwise "eligible". Never assume facts that are not listed above.
Score caps (enforced by the system): ineligible => resume_score at most ${caps.ineligible}; stretch => resume_score at most ${caps.stretch}.
Add to "score_breakdown" the field "eligibility": {"status": "eligible" | "ineligible" | "stretch", "reason": "<one sentence quoting or paraphrasing the requirement from the job description; empty string when eligible>"}.
`;
}

/** Inserts the constraints block right before the JSON output instructions of a scoring prompt. */
export function withCandidateConstraints(prompt: string): string {
  const c = loadCandidateConstraints();
  if (!c) return prompt;
  const block = constraintsBlock(c);
  const marker = "Return a single JSON object";
  const idx = prompt.indexOf(marker);
  return idx >= 0 ? `${prompt.slice(0, idx)}${block}\n${prompt.slice(idx)}` : `${prompt}\n${block}`;
}

export function parseEligibility(raw: unknown): EligibilityResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = String(r.status || "").toLowerCase();
  if (status !== "eligible" && status !== "ineligible" && status !== "stretch") return null;
  return { status, reason: typeof r.reason === "string" ? r.reason.trim() : "" };
}

/** Caps a 0-100 score according to the eligibility status (no-op without constraints). */
export function capScoreForEligibility(score: number, eligibility: EligibilityResult | null): number {
  const c = loadCandidateConstraints();
  if (!c || !eligibility || eligibility.status === "eligible") return score;
  const caps = { ...DEFAULT_CAPS, ...(c.caps || {}) };
  return Math.min(score, eligibility.status === "ineligible" ? caps.ineligible : caps.stretch);
}
