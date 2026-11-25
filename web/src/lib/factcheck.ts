/**
 * Fact-checking utilities for AI-tailored resumes and cover letters.
 *
 * - computeVerifiedFacts(): deterministic facts derived from base_resume dates/education
 *   (years of experience, internship time, education status), injected into prompts.
 * - FORBIDDEN_CLAIMS: phrases that must never appear unless literally present in the base resume.
 * - checkSection(): deterministic validation of one tailored section against the base resume.
 *
 * Pure functions, no I/O, no LLM calls.
 */
import { Resume } from "@/types";

// ---------------------------------------------------------------------------
// Dates & verified facts
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 0, fev: 1, feb: 1, mar: 2, abr: 3, apr: 3, mai: 4, may: 4, jun: 5, jul: 6,
  ago: 7, aug: 7, set: 8, sep: 8, out: 9, oct: 9, nov: 10, dez: 11, dec: 11,
};
const PRESENT_RE = /^(atual|atualmente|presente|present|current|o momento|hoje|now)$/i;
const INTERNSHIP_RE = /(estagi|intern|trainee|aprendiz|jovem aprendiz)/i;

/** Parses "mar. 2025", "03/2025", "2025-03", "março de 2025", "2025" -> absolute month index (year*12+month). */
export function parseResumeMonth(raw: string | null | undefined, isEnd: boolean, now = new Date()): number | null {
  const s = (raw || "").trim().toLowerCase();
  if (!s || PRESENT_RE.test(s)) return isEnd ? now.getFullYear() * 12 + now.getMonth() : null;
  const year = s.match(/(19|20)\d{2}/)?.[0];
  if (!year) return null;
  const y = Number(year);
  const num = s.match(/^(\d{1,2})\s*[\/.-]\s*(19|20)\d{2}$/) || s.match(/^(19|20)\d{2}\s*[\/.-]\s*(\d{1,2})$/);
  if (num) {
    const m = Number(num[1].length <= 2 && !/^(19|20)$/.test(num[1]) ? num[1] : num[2]) - 1;
    if (m >= 0 && m <= 11) return y * 12 + m;
  }
  const word = s.normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{3}/g) || [];
  for (const w of word) if (w in MONTHS) return y * 12 + MONTHS[w];
  return y * 12 + (isEnd ? 11 : 0); // year only
}

function totalMonths(intervals: [number, number][]): number {
  const sorted = intervals.filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -2;
  for (const [a, b] of sorted) {
    if (a > curEnd + 1) {
      if (curEnd >= curStart && curStart >= 0) total += curEnd - curStart + 1;
      curStart = a;
      curEnd = b;
    } else curEnd = Math.max(curEnd, b);
  }
  if (curStart >= 0) total += curEnd - curStart + 1;
  return total;
}

const fmtPt = (m: number) => {
  const y = Math.floor(m / 12), r = m % 12;
  const ys = y ? `${y} ${y === 1 ? "ano" : "anos"}` : "";
  const ms = r ? `${r} ${r === 1 ? "mês" : "meses"}` : "";
  return [ys, ms].filter(Boolean).join(" e ") || "0 meses";
};
const fmtEn = (m: number) => {
  const y = Math.floor(m / 12), r = m % 12;
  const ys = y ? `${y} ${y === 1 ? "year" : "years"}` : "";
  const ms = r ? `${r} ${r === 1 ? "month" : "months"}` : "";
  return [ys, ms].filter(Boolean).join(" and ") || "0 months";
};

export interface VerifiedFacts {
  professionalMonths: number;
  internshipMonths: number;
  professionalYearsFloor: number;
  internshipYearsFloor: number;
  professionalPeriod: string;
  internshipPeriod: string;
  education: string[];
  block: string;
}

export function computeVerifiedFacts(base: Partial<Resume>, now = new Date()): VerifiedFacts {
  const pro: [number, number][] = [];
  const intern: [number, number][] = [];
  const proLabels: string[] = [];
  const internLabels: string[] = [];
  for (const e of base.experience || []) {
    const a = parseResumeMonth(e.start_date, false, now);
    const b = parseResumeMonth(e.end_date || "atual", true, now);
    if (a === null || b === null) continue;
    const label = `${e.start_date} – ${e.end_date || "atual"}`;
    if (INTERNSHIP_RE.test(e.job_title || "")) { intern.push([a, b]); internLabels.push(label); }
    else { pro.push([a, b]); proLabels.push(label); }
  }
  const professionalMonths = totalMonths(pro);
  const internshipMonths = totalMonths(intern);
  const education = (base.education || []).map((ed) =>
    [ed.degree, ed.institution, [ed.start_year, ed.end_year].filter(Boolean).join("–")].filter(Boolean).join(" — "),
  );

  const yF = Math.floor(professionalMonths / 12);
  const iF = Math.floor(internshipMonths / 12);
  const block = `VERIFIED FACTS (computed by code from the resume dates — authoritative, override anything else):
- Total professional experience, EXCLUDING internships: ${fmtEn(professionalMonths)} / ${fmtPt(professionalMonths)} (periods: ${proLabels.join("; ") || "none"}).
- Internship experience: ${fmtEn(internshipMonths)} / ${fmtPt(internshipMonths)} (periods: ${internLabels.join("; ") || "none"}).
- Education, with status exactly as recorded: ${education.join(" | ") || "none"}.
RULES FOR THESE FACTS:
- Years of experience may ONLY be stated using the values above: "${yF}+ years" / "${yF}+ anos" (or the exact "${fmtEn(professionalMonths)}" / "${fmtPt(professionalMonths)}"). Stating years is optional; never round up.
- NEVER attribute years to a specific technology, tool, language or framework (e.g., "3+ years of React", "2 anos de TypeScript" are forbidden).
- NEVER describe the status of a course (cursando, graduando, formando, formado, concluído, in progress, graduated, pursuing) beyond the exact education text above.`;

  return {
    professionalMonths,
    internshipMonths,
    professionalYearsFloor: yF,
    internshipYearsFloor: iF,
    professionalPeriod: proLabels.join("; "),
    internshipPeriod: internLabels.join("; "),
    education,
    block,
  };
}

// ---------------------------------------------------------------------------
// Forbidden claims
// ---------------------------------------------------------------------------

export const FORBIDDEN_CLAIMS: { category: string; re: RegExp }[] = [
  // Intention / disposition
  { category: "intenção/disposição", re: /\b(disposi[cç][aã]o|vontade|desejo|interesse|motiva[cç][aã]o|ansios[oa]|entusiasmad[oa]) (para|em|por|de) (aprender|crescer|evoluir|se desenvolver|adquirir)\w*/giu },
  { category: "intenção/disposição", re: /\binteresse em\b/giu },
  { category: "intenção/disposição", re: /\b(eager|keen|willing(ness)?|motivated|excited|passionate|ready) (to|about|for) (learn|grow|master|pick up|acquire)\w*/giu },
  { category: "intenção/disposição", re: /\b(interest in|passion for learning|desire to learn|willingness to learn|eagerness to learn)\b/giu },
  { category: "intenção/disposição", re: /\b(em|in) (constante )?aprendizado (de|em) /giu },
  // Team / organizational context
  { category: "contexto de equipe", re: /\bcross[- ]?functional\b/giu },
  { category: "contexto de equipe", re: /\bsquads?\b/giu },
  { category: "contexto de equipe", re: /\bstakeholders?\b/giu },
  { category: "contexto de equipe", re: /\b(times?|equipes?) (multidisciplinares?|multifuncionais?|interdisciplinares?|[aá]geis)\b/giu },
  { category: "contexto de equipe", re: /\b(multidisciplinary|multi-disciplinary|interdisciplinary|agile) teams?\b/giu },
  // Architecture adjectives
  { category: "arquitetura", re: /\bdistributed\b/giu },
  { category: "arquitetura", re: /\bdistribu[ií]d[oa]s?\b/giu },
  { category: "arquitetura", re: /\bmicro-?s?servi[cç]os?\b/giu },
  { category: "arquitetura", re: /\bmicro-?services?\b/giu },
  { category: "arquitetura", re: /\bescal[aá]ve(l|is)\b/giu },
  { category: "arquitetura", re: /\bescalabilidade\b/giu },
  { category: "arquitetura", re: /\bscalab(le|ility)\b/giu },
  { category: "arquitetura", re: /\balta disponibilidade\b/giu },
  { category: "arquitetura", re: /\bhigh[- ]availability\b/giu },
  { category: "arquitetura", re: /\balta (performance|escala)\b/giu },
  { category: "arquitetura", re: /\b(high|large)[- ]scale\b/giu },
  // Business-requirements flourishes
  { category: "floreio", re: /\btraduz\w*[^.;\n]{0,40}requisitos (de|do) neg[oó]cio\b/giu },
  { category: "floreio", re: /\brequisitos (de|do) neg[oó]cio em solu[cç][oõ]es\b/giu },
  { category: "floreio", re: /\btranslat\w*[^.;\n]{0,40}business (requirements|needs)\b/giu },
  { category: "floreio", re: /\bbusiness (requirements|needs) into (technical )?solutions\b/giu },
  { category: "floreio", re: /\b(vis[aã]o|mentalidade) (de|do) (neg[oó]cio|dono)\b/giu },
  { category: "floreio", re: /\b(business|product|ownership) mindset\b/giu },
];

/** Technologies commonly requested by job ads; flagged when they appear in tailored text but not in the base. */
const TECH_DICTIONARY = [
  "Java", "Spring", "Spring Boot", "Kotlin", "Scala", "C#", ".NET", "ASP.NET", "Golang", "Rust", "Ruby", "Rails",
  "PHP", "Laravel", "Symfony", "Django", "Flask", "FastAPI", "Angular", "Vue", "Vue.js", "Svelte", "Next.js",
  "Nuxt", "NestJS", "Express.js", "React Native", "Flutter", "Dart", "Swift", "Objective-C", "Elixir",
  "Kafka", "RabbitMQ", "SQS", "Kubernetes", "K8s", "Helm", "Terraform", "Ansible", "Jenkins", "GitLab CI",
  "GitHub Actions", "CircleCI", "AWS", "Lambda", "EC2", "S3", "GCP", "Google Cloud", "BigQuery", "Azure",
  "Firebase", "Vercel", "Netlify", "Heroku", "Nginx", "Apache", "Linux", "MongoDB", "MySQL", "SQL Server",
  "T-SQL", "Oracle", "Redis", "Elasticsearch", "DynamoDB", "Cassandra", "Snowflake", "Databricks", "Spark",
  "Hadoop", "Airflow", "dbt", "GraphQL", "gRPC", "Prisma", "TypeORM", "Sequelize", "Redux", "Jest", "Vitest",
  "Cypress", "Playwright", "Selenium", "pytest", "Storybook", "Webpack", "Vite", "Jira", "Confluence",
  "Power BI", "Power Automate", "Power Apps", "Dataverse", "Tableau", "Looker", "Salesforce", "SAP",
  "TensorFlow", "PyTorch", "LangChain", "OpenAI", "Pandas", "NumPy", "scikit-learn", "Bizagi", "WCF", "jQuery",
  "Wagtail", "Laravel", "Shopify", "Magento", "VTEX", "Zapier", "Make.com",
];

// ---------------------------------------------------------------------------
// Deterministic section check
// ---------------------------------------------------------------------------

const norm = (s: string) => (s || "").normalize("NFC").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wholeWord = (term: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term.toLowerCase())}($|[^\\p{L}\\p{N}+#])`, "u");

/**
 * Normalizes numbers so "1.500", "1,500" and "1500" compare equal.
 * Digits glued to a preceding letter are part of a name, not a metric (HTML5, CSS3, v4, S3).
 */
function numbersIn(text: string): string[] {
  return (text.match(/(?<![\p{L}\d.,])\d+(?:[.,]\d+)*/gu) || []).map((n) => n.replace(/[.,]/g, ""));
}

/** True when `phrase` occurs in `text` as whole words (not inside another word, e.g. "formado" in "informados"). */
const containsWhole = (text: string, phrase: string) => wholeWord(phrase).test(text);

export interface BaseIndex {
  text: string;            // normalized full base text (incl. context_notes, dates, education)
  numbers: Set<string>;
  techs: Set<string>;      // normalized base skills + technologies
  facts: VerifiedFacts;
}

export function buildBaseIndex(base: Partial<Resume>, facts: VerifiedFacts): BaseIndex {
  const parts: string[] = [base.summary || "", ...(base.skills || []), ...(base.languages || [])];
  for (const e of base.experience || [])
    parts.push(e.job_title, e.company, e.location || "", e.start_date || "", e.end_date || "", ...(e.bullets || []),
      e.description || "", e.context_notes || "", ...(e.technologies || []));
  for (const p of base.projects || [])
    parts.push(p.name, p.role || "", p.date || "", ...(p.bullets || []), p.description || "", p.context_notes || "", ...(p.technologies || []));
  for (const ed of base.education || []) parts.push(ed.degree, ed.field_of_study || "", ed.institution, ed.start_year || "", ed.end_year || "");
  for (const c of base.certifications || []) parts.push(c.name, c.issuer || "", c.year || "");
  const text = norm(parts.filter(Boolean).join("\n"));
  const numbers = new Set(numbersIn(text));
  // Numbers that the VERIFIED FACTS legitimately introduce
  for (const n of [facts.professionalYearsFloor, facts.professionalMonths % 12, facts.internshipYearsFloor, facts.internshipMonths % 12])
    numbers.add(String(n));
  const techs = new Set(
    [...(base.skills || []), ...(base.experience || []).flatMap((e) => e.technologies || []), ...(base.projects || []).flatMap((p) => p.technologies || [])]
      .map(norm).filter(Boolean),
  );
  return { text, numbers, techs, facts };
}

export interface SectionViolation {
  rule: "numero" | "anos" | "tecnologia" | "proibida" | "status-curso" | "idioma";
  trecho: string;
  motivo: string;
}

const PT_FUNCTION_WORDS = /(?<![\p{L}])(de|do|da|dos|das|com|para|em|no|na|nos|nas|um|uma|os|as|não|que|por|pela|pelo|e|ao|à)(?![\p{L}])/giu;
const EN_FUNCTION_WORDS = /(?<![\p{L}])(the|and|with|for|of|to|in|on|a|an|by|from|that|using|across|into|as)(?![\p{L}])/giu;

/** Short-text language guess (works on single bullets): "pt", "en" or null when undecidable. */
export function guessLanguage(text: string): "pt" | "en" | null {
  const t = (text || "").normalize("NFC");
  const pt = (t.match(PT_FUNCTION_WORDS) || []).length + 2 * (t.match(/[ãõç]/giu) || []).length;
  const en = (t.match(EN_FUNCTION_WORDS) || []).length;
  if (pt === 0 && en === 0) return null;
  if (pt > en) return "pt";
  if (en > pt) return "en";
  return null;
}

/** Violation when a text is written in the wrong language for the job. */
export function checkLanguage(text: string, expected: "pt" | "en"): SectionViolation[] {
  const got = guessLanguage(text);
  if (!got || got === expected) return [];
  return [{
    rule: "idioma",
    trecho: text.slice(0, 60),
    motivo: `texto em ${got === "pt" ? "português" : "inglês"}, mas a vaga está em ${expected === "pt" ? "português" : "inglês"}`,
  }];
}

// Student/graduate status words only ("em andamento"/"in progress" are legitimate for projects).
const COURSE_STATUS_RE = /\b(cursando|graduand[oa]|formand[oa]|formad[oa]|rec[eé]m[- ]formad[oa]|estudante de|aluno de|pursuing|currently studying|undergraduate student|expected graduation|soon to graduate|graduated|graduate of)\b/giu;

/** Validates free text of one section. `skillsList` (optional) validates a skills array item by item. */
export function checkSection(text: string, idx: BaseIndex, skillsList?: string[]): SectionViolation[] {
  const out: SectionViolation[] = [];
  const t = norm(text);

  // 1. Numbers must exist in the base (or come from VERIFIED FACTS)
  for (const n of numbersIn(t)) {
    if (!idx.numbers.has(n)) out.push({ rule: "numero", trecho: n, motivo: "número não existe no currículo base" });
  }

  // 2. Years of experience must match VERIFIED FACTS and never be tied to a technology
  const yearsRe = /(\d+)\s*\+?\s*(anos?|years?|yrs?)\b([^.;:\n]{0,80})/giu;
  for (const m of t.matchAll(yearsRe)) {
    const n = Number(m[1]);
    const tail = m[3] || "";
    const around = t.slice(Math.max(0, (m.index || 0) - 40), (m.index || 0) + m[0].length);
    const isIntern = /(estagi|\bintern(ship)?s?\b)/u.test(around); // not "internal"/"international"
    const allowed = isIntern ? idx.facts.internshipYearsFloor : idx.facts.professionalYearsFloor;
    if (n !== allowed) out.push({ rule: "anos", trecho: m[0].trim().slice(0, 60), motivo: `anos de experiência diferente do VERIFIED FACTS (${allowed})` });
    // Total professional experience followed by a separate clause ("2+ anos de experiência profissional,
    // atuando com React") is not a per-technology claim: only the text before the first comma counts,
    // and "de experiência profissional" / "of professional experience" is the allowed total form.
    // ("2 anos de experiência profissional em React" is still a per-technology claim.)
    let clause = tail.split(",")[0];
    const total = clause.match(/^\s*(de experi[eê]ncia profissional|of professional experience)\b/u);
    if (total) {
      const rest = clause.slice(total[0].length);
      clause = /^\s*(em|com|no|na|in|with|using|on)\b/u.test(rest) ? rest : "";
    }
    const techHit = [...idx.techs, ...TECH_DICTIONARY.map(norm)].find((tech) => tech.length >= 2 && wholeWord(tech).test(clause));
    if (techHit) out.push({ rule: "anos", trecho: m[0].trim().slice(0, 60), motivo: `anos atribuídos a tecnologia específica (${techHit})` });
  }

  // 3. No technology outside the base
  for (const tech of TECH_DICTIONARY) {
    const tn = norm(tech);
    if (idx.techs.has(tn) || wholeWord(tn).test(idx.text)) continue;
    if (wholeWord(tn).test(t)) out.push({ rule: "tecnologia", trecho: tech, motivo: "tecnologia não existe no currículo base" });
  }
  if (skillsList) {
    for (const s of skillsList) {
      const sn = norm(s).trim();
      if (sn && !idx.techs.has(sn) && !containsWhole(idx.text, sn))
        out.push({ rule: "tecnologia", trecho: s, motivo: "skill não existe no currículo base" });
    }
  }

  // 4. Forbidden claims (unless literally present in the base)
  for (const { category, re } of FORBIDDEN_CLAIMS) {
    for (const m of t.matchAll(new RegExp(re.source, re.flags))) {
      if (!containsWhole(idx.text, m[0])) out.push({ rule: "proibida", trecho: m[0], motivo: `expressão proibida (${category})` });
    }
  }

  // 5. Course status beyond the base education text
  for (const m of t.matchAll(new RegExp(COURSE_STATUS_RE.source, COURSE_STATUS_RE.flags))) {
    if (!containsWhole(idx.text, m[0])) out.push({ rule: "status-curso", trecho: m[0], motivo: "status de curso não registrado no base" });
  }

  // de-duplicate
  const seen = new Set<string>();
  return out.filter((v) => { const k = `${v.rule}|${v.trecho}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Text block with the forbidden-claims policy, for prompts. */
export const FORBIDDEN_CLAIMS_PROMPT = `FORBIDDEN CLAIMS (never write these unless the exact wording already exists in the candidate's Master Resume):
- Intentions or dispositions: "willing/eager to learn", "interest in", "disposição/vontade para aprender", "interesse em", or any statement about what the candidate wants to learn.
- Team or organizational context: "cross-functional", "squads", "stakeholders", "times/equipes multidisciplinares", "multidisciplinary/agile teams".
- Architecture adjectives: "distributed", "distribuído", "microservices/microsserviços", "scalable/escalável", "high availability/alta disponibilidade", "high-scale/alta escala".
- Flourishes such as "translating business requirements into technical solutions", "traduzir requisitos de negócio", "visão de negócio", "business mindset".
- Course status (cursando, graduando, formado, pursuing, graduated...) beyond the exact education text in VERIFIED FACTS.
- Prototypes must be described as prototypes (never "built/construí <feature>" for screens of a prototype).
KEYWORD MIRRORING: a job-description term may replace an existing term ONLY as a synonym for something the Master Resume already describes. Never use a job keyword to add scope, technologies, responsibilities or context that the Master Resume does not contain.`;

/**
 * Fixed fields: job titles, companies, degrees and institutions are never written by the LLM.
 * Each value in the tailored resume must equal the base value or its fixed English version (*_en).
 * "Bachelor" is rejected unless the base degree itself says so. Returns the problems found.
 */
export function checkFixedTitles(tailored: Partial<Resume>, base: Partial<Resume>): string[] {
  const problems: string[] = [];
  const allowed = (...v: (string | null | undefined)[]) => new Set(v.filter((x): x is string => Boolean(x && x.trim())).map((x) => x.trim()));
  const baseExp = base.experience || [];
  (tailored.experience || []).forEach((e, i) => {
    const b = baseExp.find((x) => x.company === e.company && x.job_title === e.job_title) || baseExp[i];
    if (!b) return problems.push(`experience[${i}]: role not in master resume ("${e.job_title}" @ "${e.company}")`);
    if (!allowed(b.job_title, b.job_title_en).has((e.job_title || "").trim())) problems.push(`experience[${i}].job_title "${e.job_title}" not in {${b.job_title}, ${b.job_title_en || "-"}}`);
    if (e.job_title_en && e.job_title_en !== b.job_title_en) problems.push(`experience[${i}].job_title_en "${e.job_title_en}" differs from master`);
    if (!allowed(b.company, b.company_en).has((e.company || "").trim())) problems.push(`experience[${i}].company "${e.company}" not in master`);
    if (e.company_en && e.company_en !== b.company_en) problems.push(`experience[${i}].company_en "${e.company_en}" differs from master`);
  });
  const baseEdu = base.education || [];
  (tailored.education || []).forEach((ed, i) => {
    const b = baseEdu.find((x) => x.institution === ed.institution) || baseEdu[i];
    if (!b) return problems.push(`education[${i}]: not in master resume ("${ed.degree}")`);
    if (!allowed(b.degree, b.degree_en).has((ed.degree || "").trim())) problems.push(`education[${i}].degree "${ed.degree}" not in master`);
    if (ed.degree_en && ed.degree_en !== b.degree_en) problems.push(`education[${i}].degree_en "${ed.degree_en}" differs from master`);
    if (ed.institution_en && ed.institution_en !== b.institution_en) problems.push(`education[${i}].institution_en differs from master`);
    const bachelor = /bachelor|bacharel/i;
    if ([ed.degree, ed.degree_en].some((d) => d && bachelor.test(d)) && ![b.degree, b.degree_en].some((d) => d && bachelor.test(d))) {
      problems.push(`education[${i}]: "Bachelor" claimed but the master degree is not a bachelor's`);
    }
  });
  // Languages and levels: exactly the master list (PT) or its fixed English list, nothing else.
  const norm = (list: (string | null | undefined)[] | null | undefined) =>
    (list || []).filter((x): x is string => Boolean(x && x.trim())).map((x) => x.trim()).sort().join("\n");
  const tailoredLangs = norm(tailored.languages);
  if (tailoredLangs && tailoredLangs !== norm(base.languages) && tailoredLangs !== norm(base.languages_en)) {
    problems.push(`languages ${JSON.stringify(tailored.languages)} differ from the master list (PT or EN)`);
  }
  return problems;
}
