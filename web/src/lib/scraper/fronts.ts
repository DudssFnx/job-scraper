// Multi-front LinkedIn search ("frentes"), driven by app_settings.search_locations.
//
// Each front = one market: one or more LinkedIn locations (name + geoId), its own workplace
// filter (f_WT), its own search terms, the weekdays it runs on and a daily quota.
// When no front is enabled for today, the scraper keeps its original single-location behaviour.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkedInConfig, ScrapedJob } from "./types";

export interface FrontLocation {
  name: string;
  geoId: string;
}

export interface SearchFront {
  id: string;
  label: string;
  enabled: boolean;
  locations: FrontLocation[];
  /** LinkedIn workplace filter: 1 = on-site, 2 = remote, 3 = hybrid (comma separated) */
  f_WT: string;
  queries: string[];
  /** 0 = Sunday ... 6 = Saturday, in the schedule timezone */
  weekdays: number[];
  daily_cap: number;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Keeps only well-formed front entries; legacy SearchLocation rows (no queries) are ignored. */
export function parseSearchFronts(raw: unknown): SearchFront[] {
  if (!Array.isArray(raw)) return [];
  const out: SearchFront[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const queries = Array.isArray(r.queries) ? r.queries.filter((q): q is string => typeof q === "string" && q.trim() !== "") : [];
    const locations = Array.isArray(r.locations)
      ? (r.locations as Record<string, unknown>[])
          .filter((l) => l && typeof l.name === "string" && l.name.trim() !== "")
          .map((l) => ({ name: String(l.name).trim(), geoId: l.geoId == null ? "" : String(l.geoId).trim() }))
      : [];
    const weekdays = Array.isArray(r.weekdays) ? r.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    const cap = Number(r.daily_cap);
    if (!queries.length || !locations.length || !weekdays.length || !(cap > 0)) continue;
    out.push({
      id: String(r.id ?? r.label ?? `front-${out.length + 1}`),
      label: String(r.label ?? r.id ?? `Frente ${out.length + 1}`),
      enabled: r.enabled !== false,
      locations,
      f_WT: typeof r.f_WT === "string" && /^[123](,[123])*$/.test(r.f_WT) ? r.f_WT : "1,2,3",
      queries,
      weekdays,
      daily_cap: Math.floor(cap),
    });
  }
  return out;
}

export function weekdayInTimeZone(timeZone: string, now = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now).toLowerCase();
  return WEEKDAYS.indexOf(short.slice(0, 3));
}

/** Start of "today" in the given timezone, as an ISO instant. */
export function startOfDayInTimeZone(timeZone: string, now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs).toISOString();
}

export interface FrontPlan {
  front: SearchFront;
  quota: number;
}

/** Fronts that run today, each with its quota, never exceeding the remaining daily budget. */
export function planFrontsForToday(fronts: SearchFront[], weekday: number, budget: number): FrontPlan[] {
  const plans: FrontPlan[] = [];
  let left = Math.max(0, budget);
  for (const front of fronts) {
    if (!front.enabled || !front.weekdays.includes(weekday)) continue;
    const quota = Math.min(front.daily_cap, left);
    plans.push({ front, quota });
    left -= quota;
  }
  return plans;
}

export interface RunFrontsDeps {
  supabase: SupabaseClient;
  baseConfig: LinkedInConfig;
  timeZone: string;
  dailyCap: number;
  force: boolean;
  dryRun: boolean;
  processLinkedInQuery: (query: string, location: string, supabase: SupabaseClient, config: LinkedInConfig, limit: number) => Promise<ScrapedJob[]>;
  saveJobsToSupabase: (supabase: SupabaseClient, jobs: ScrapedJob[]) => Promise<number>;
  sleep: (ms: number) => Promise<unknown>;
  randomBetween: (min: number, max: number) => number;
}

/** Runs every front scheduled for today. Returns how many new jobs were saved. */
export async function runLinkedInFronts(fronts: SearchFront[], deps: RunFrontsDeps): Promise<number> {
  const { supabase, baseConfig, timeZone } = deps;
  const weekday = weekdayInTimeZone(timeZone);

  let alreadyToday = 0;
  try {
    const { count } = await supabase
      .from("jobs")
      .select("job_id", { count: "exact", head: true })
      .eq("provider", "linkedin")
      .gte("scraped_at", startOfDayInTimeZone(timeZone));
    alreadyToday = count ?? 0;
  } catch {
    // Non-fatal: assume nothing was scraped yet.
  }

  const budget = deps.force ? deps.dailyCap : Math.max(0, deps.dailyCap - alreadyToday);
  const plans = planFrontsForToday(fronts, weekday, budget);
  console.log(
    `[Frentes] Dia ${WEEKDAYS[weekday]} (${timeZone}) | Teto diario: ${deps.dailyCap} | Ja coletadas hoje: ${alreadyToday} | Orcamento: ${budget} | ` +
      `Frentes de hoje: ${plans.map((p) => `${p.front.label}=${p.quota}`).join(", ") || "nenhuma"}`,
  );

  let saved = 0;
  for (const { front, quota } of plans) {
    if (quota <= 0) {
      console.log(`[Frente] ${front.label}: sem cota hoje (orcamento diario esgotado).`);
      continue;
    }
    const combos = front.locations.flatMap((loc) => front.queries.map((query) => ({ loc, query })));
    let frontScraped = 0;
    for (let i = 0; i < combos.length && frontScraped < quota; i++) {
      const { loc, query } = combos[i];
      // Spread what is left over the remaining terms, so a term with no results hands its share on.
      const limit = Math.max(1, Math.ceil((quota - frontScraped) / (combos.length - i)));
      console.log(`\n------------------------------------------------------------`);
      console.log(`[Frente] ${front.label} | local "${loc.name}" (geoId ${loc.geoId || "none"}) | f_WT ${front.f_WT} | termo "${query}" | limite ${limit} | cota da frente ${frontScraped}/${quota}`);
      console.log(`------------------------------------------------------------`);
      const jobs = await deps.processLinkedInQuery(query, loc.name, supabase, { ...baseConfig, location: loc.name, geoId: loc.geoId, f_WT: front.f_WT }, limit);
      frontScraped += jobs.length;
      if (jobs.length > 0) {
        if (deps.dryRun) {
          console.log(`[Dry-Run] ${jobs.length} vaga(s) para "${query}" em ${loc.name}:`);
          jobs.forEach((j, idx) => console.log(`  ${idx + 1}. [${j.job_id}] ${j.job_title} @ ${j.company}`));
        } else {
          saved += await deps.saveJobsToSupabase(supabase, jobs);
        }
      } else {
        console.log(`[Frente] ${front.label}: nenhuma vaga nova para "${query}" em ${loc.name}.`);
      }
      if (i < combos.length - 1 && frontScraped < quota) {
        const wait = deps.randomBetween(baseConfig.searchQueryMinDelay, baseConfig.searchQueryMaxDelay);
        console.log(`[LinkedIn] Waiting ${wait.toFixed(2)}s before next query...`);
        await deps.sleep(wait * 1000);
      }
    }
    console.log(`[Frente] ${front.label}: ${frontScraped} vaga(s) coletada(s) de ${quota}.`);
  }
  return saved;
}
