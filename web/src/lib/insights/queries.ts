// Leituras (somente SELECT) para a página /insights. Nenhuma escrita no banco.
import { promises as fs } from "fs";
import path from "path";
import { createSupabaseStaticClient } from "@/utils/supabase/server";
import {
  lastNDays,
  parseIaLog,
  type InsightJob,
  type LogCounters,
  type RunMetrics,
  type ScrapeRunLog,
} from "./compute";

const PAGE = 1000;

async function selectAll<T>(table: string, columns: string, apply?: (q: any) => any): Promise<T[]> {
  const supabase = createSupabaseStaticClient();
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`[insights] ${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export function getInsightJobs(): Promise<InsightJob[]> {
  return selectAll<InsightJob>(
    "jobs",
    "job_id, provider, status, resume_score, scraped_at, application_date, customized_resume_id, status_history, score_breakdown",
    (q) => q.order("scraped_at", { ascending: true }),
  );
}

export async function getCustomizedResumeDates(): Promise<string[]> {
  const rows = await selectAll<{ created_at: string | null }>("customized_resumes", "created_at");
  return rows.map((r) => r.created_at).filter((d): d is string => Boolean(d));
}

export function getScrapeRunLogs(): Promise<ScrapeRunLog[]> {
  return selectAll<ScrapeRunLog>("automation_runs", "started_at, log_output", (q) =>
    q.eq("workflow_id", "scrape_jobs").order("started_at", { ascending: true }),
  );
}

export function getRunMetricsSince(sinceIso: string): Promise<RunMetrics[]> {
  return selectAll<RunMetrics>("automation_runs", "workflow_id, started_at, metrics", (q) =>
    q.gte("started_at", sinceIso).order("started_at", { ascending: true }),
  );
}

export async function getConfiguredSearchTerms(): Promise<string[]> {
  const { data, error } = await createSupabaseStaticClient()
    .from("app_settings")
    .select("linkedin_search_queries")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`[insights] app_settings: ${error.message}`);
  const q = (data as { linkedin_search_queries?: unknown } | null)?.linkedin_search_queries;
  return Array.isArray(q) ? q.filter((t): t is string => typeof t === "string") : [];
}

/** Pasta dos logs do rodar-ia.bat (C:\dev\jobtrack\logs). O app roda a partir de web/. */
async function resolveLogsDir(): Promise<string | null> {
  for (const dir of [path.resolve(process.cwd(), "..", "logs"), path.resolve(process.cwd(), "logs")]) {
    try {
      if ((await fs.stat(dir)).isDirectory()) return dir;
    } catch {
      /* tenta a próxima */
    }
  }
  return null;
}

/** Lê logs/ia-AAAA-MM-DD.log dos últimos N dias. Retorna null se a pasta não existir. */
export async function getIaLogCounters(days: number): Promise<Map<string, LogCounters> | null> {
  const dir = await resolveLogsDir();
  if (!dir) return null;
  const out = new Map<string, LogCounters>();
  await Promise.all(
    lastNDays(days).map(async (date) => {
      try {
        out.set(date, parseIaLog(await fs.readFile(path.join(dir, `ia-${date}.log`), "utf8")));
      } catch {
        /* sem log nesse dia */
      }
    }),
  );
  return out;
}

