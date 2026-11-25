// Fila de candidatura para o jobtrack.bat: vagas ativas, com curriculo adaptado,
// nota >= 70 e sem candidatura. Le web/.env.local (nao imprime chaves).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const MIN_SCORE = 70;
const APPLIED = new Set(["applied", "interviewing", "offer", "rejected"]);

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("[ERRO] web/.env.local sem as variaveis do Supabase."); process.exit(1); }
  const { data, error } = await createClient(url, key)
    .from("jobs")
    .select("job_id, company, job_title, resume_score, workplace_type, status, application_date, application_url")
    .eq("is_active", true)
    .not("customized_resume_id", "is", null)
    .gte("resume_score", MIN_SCORE)
    .order("resume_score", { ascending: false });
  if (error) { console.log(`[ERRO] Supabase: ${error.message}`); process.exit(1); }
  const fila = (data || []).filter((j) => !APPLIED.has(j.status) && !j.application_date);
  console.log(`${fila.length} vaga(s) com nota >= ${MIN_SCORE}, curriculo adaptado e sem candidatura:`);
  for (const j of fila) {
    const link = j.application_url?.startsWith("http") ? j.application_url : `https://www.linkedin.com/jobs/view/${j.job_id}`;
    console.log(`  ${String(j.resume_score).padStart(3)}  ${j.company} - ${j.job_title} [${j.workplace_type || "?"}]  ${link}`);
  }
  if (fila.length === 0) console.log("  (vazia)");
})().catch((e) => { console.log(`[ERRO] ${e.message}`); process.exit(1); });
