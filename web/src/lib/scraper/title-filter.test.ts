// Run: npm run test:filter
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TITLE_EXCLUDE,
  DEFAULT_TITLE_EXCLUDE_STACK,
  filterCandidatesByTitle,
  resolveTermList,
  titleExclusion,
} from "./title-filter";

const rules = { exclude: DEFAULT_TITLE_EXCLUDE, excludeStack: DEFAULT_TITLE_EXCLUDE_STACK };
const skips = (title: string) => titleExclusion(title, rules) !== null;

test("titulos reais do dry-run de 25/11", () => {
  assert.equal(skips("Desenvolvedor (a) Fullstack Java - Pleno"), true);
  assert.equal(skips("Mid Fullstack Java/React Developer"), false);
  assert.equal(skips("Senior Software Engineer"), true);
  assert.equal(skips("Frontend Engineer (React/Next.js)"), false);
  assert.equal(skips("Full Stack Developer (Go)"), true);
  assert.equal(skips("JavaScript Developer"), false);
  assert.equal(skips("Staff Software Engineer, AI (Squad Lead)"), true);
});

test("palavra inteira, sem diferenciar maiusculas e acentos", () => {
  assert.deepEqual(titleExclusion("Desenvolvedor SENIOR", rules), { rule: "titulo", term: "senior" });
  assert.equal(skips("Desenvolvedor Sênior"), true);
  assert.equal(skips("Desenvolvedora Senior"), true);
  assert.equal(skips("Sr. Backend Developer"), true);
  assert.equal(skips("Headless CMS Developer"), false); // "head" so como palavra
  assert.equal(skips("Developer - Leadership track"), false); // "lead" so como palavra
  assert.equal(skips("Desenvolvedor Fullstack - Alemão fluente"), true);
  assert.equal(skips("Développeur Français"), true);
});

test("termos extras (ajuste A)", () => {
  assert.equal(skips("Sr Developer"), true);
  assert.equal(skips("Especialista em Solutions Delivery | Digital"), true);
  assert.equal(skips("Software Architect"), true);
  assert.equal(skips("Java Developer (ReactJS)"), false);
  assert.equal(skips("SRE Engineer"), false);
  assert.equal(skips("Headless CMS Developer"), false);
  assert.equal(skips("Frontend Developer - Germany"), false);
  assert.equal(skips("Diretor de Tecnologia"), true);
  assert.equal(skips("Dutch speaking Developer"), true);
  assert.equal(skips("PHP Developer (NodeJS)"), false);
  assert.equal(skips("Angular Developer (NextJS)"), false);
});

test("stack fora so exclui sem react/node/typescript/javascript/python/next", () => {
  assert.deepEqual(titleExclusion("Desenvolvedor .NET Pleno", rules), { rule: "stack", term: ".net" });
  assert.equal(skips("ASP.NET Developer"), true);
  assert.equal(skips("Desenvolvedor C# Pleno"), true);
  assert.equal(skips("Golang Developer"), true);
  assert.equal(skips("Angular Developer"), true);
  assert.equal(skips("Desenvolvedor PHP"), true);
  assert.equal(skips("Fullstack Developer (Angular + Node.js)"), false);
  assert.equal(skips("Python / Java Engineer"), false);
  assert.equal(skips("Desenvolvedor Fullstack (Go) - TypeScript"), false);
  assert.equal(skips("Google Cloud Developer"), false); // "go" solto nao e termo
});

test("filterCandidatesByTitle separa mantidas e puladas", () => {
  const r = filterCandidatesByTitle(
    [
      { job_id: "1", job_title: "Desenvolvedor Fullstack", company: "Acme", location: null },
      { job_id: "2", job_title: "Desenvolvedor PHP", company: "Acme", location: null },
      { job_id: "3", job_title: null, company: "Outra", location: null },
      { job_id: "4", job_title: "Senior Developer", company: "Acme", location: null },
    ],
    rules,
  );
  assert.deepEqual(r.kept.map((c) => c.job_id), ["1", "3"]);
  assert.deepEqual(r.skipped.map((s) => [s.candidate.job_id, s.rule]), [["2", "stack"], ["4", "titulo"]]);
});

test("lista do app_settings: null usa o padrao, [] desliga", () => {
  assert.deepEqual(resolveTermList(null, ["a"]), ["a"]);
  assert.deepEqual(resolveTermList([], ["a"]), []);
  assert.deepEqual(resolveTermList(["x", " ", 3], ["a"]), ["x"]);
});
