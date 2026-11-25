// Resume header location per market (server-only, deterministic, no LLM).
//
// Jobs in the candidate's home country keep the base resume location. For jobs abroad, the header
// says where the candidate is and how they would work: remote (with timezone) or open to relocation.
// It never claims work authorization. The actual lines come from the local constraints file
// (candidate-constraints.local.json -> "header"); without it the base location is kept.
import { loadCandidateConstraints } from "@/lib/eligibility";
import { isPortugueseText } from "@/lib/llm";

export interface MarketJob {
  location?: string | null;
  workplace_type?: string | null;
  description?: string | null;
}

export type Market = "home" | "remote_abroad" | "onsite_abroad" | "unknown";

export function classifyMarket(job: MarketJob, homeCountryPattern: string): Market {
  const loc = (job.location || "").trim();
  if (!loc) return "unknown";
  if (new RegExp(homeCountryPattern, "i").test(loc)) return "home";
  const remote = job.workplace_type === "remote" || /\b(remote|remoto|worldwide|anywhere)\b/i.test(loc);
  return remote ? "remote_abroad" : "onsite_abroad";
}

/** Returns the header location for this job, or the base location when nothing applies. */
export function headerLocationForJob(baseLocation: string, job: MarketJob): string {
  const header = loadCandidateConstraints()?.header;
  if (!header) return baseLocation;
  const market = classifyMarket(job, header.home_country_pattern);
  if (market === "home" || market === "unknown") return baseLocation;
  const pt = isPortugueseText(job.description || "");
  const line =
    market === "remote_abroad"
      ? pt ? header.remote_pt : header.remote_en
      : pt ? header.relocation_pt : header.relocation_en;
  return line?.trim() || baseLocation;
}
