/** One-off, resumable comparison of decision models. Never imports the app or connects to a DB. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import type { GoldenCase } from "../harness/types";
import { DEFAULT_CASES, EXPERIMENT_VERSION, QUESTION_BATCH_SIZE, auditExtraction, evaluate, makeRequest, requestHash, validateAnswers, type Request } from "./core";
import { callProvider, MODELS, type Provider, type ProviderResult } from "./providers";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { values } = parseArgs({ options: {
  prepare: { type: "boolean", default: false },
  provider: { type: "string", default: "both" },
  cases: { type: "string", default: DEFAULT_CASES.join(",") },
  source: { type: "string", default: "evals/runs/2026-10-14-feature4-r1.json" },
  out: { type: "string", default: "evals/decision-comparison/results" },
  env: { type: "string" },
  report: { type: "boolean", default: false },
} });
const out = path.resolve(root, values.out!);
const source = path.resolve(root, values.source!);
const sourceBytes = fs.readFileSync(source);
const sourceRun = JSON.parse(sourceBytes.toString());
if (sourceRun.mockLlm || sourceRun.summary.errors) throw new Error("Source must be an error-free real run");
const caseIds = values.cases!.split(",").map(s => s.trim().padStart(2, "0"));
if (new Set(caseIds).size !== caseIds.length || caseIds.some(id => !/^\d{2}$/.test(id))) throw new Error("Cases must be unique two-digit IDs");
if (!["both", "claude", "jev"].includes(values.provider!)) throw new Error("Provider must be both, claude, or jev");
const providers: Provider[] = values.provider === "both" ? ["claude", "jev"] : [values.provider as Provider];
const keysFromFile = values.env ? parse(fs.readFileSync(path.resolve(values.env))) : {};
// Read ONLY model credentials. No database URL, mail or webhook secret is loaded.
const gatewayKey = process.env.AI_GATEWAY_API_KEY ?? keysFromFile.AI_GATEWAY_API_KEY;
const jevTransport = gatewayKey ? "gateway" : "typesafe";
const keys = {
  claude: process.env.ANTHROPIC_API_KEY ?? keysFromFile.ANTHROPIC_API_KEY,
  jev: gatewayKey ?? process.env.TYPESAFE_API_KEY ?? keysFromFile.TYPESAFE_API_KEY,
};
type Case = { id: string; golden: GoldenCase; request: Request; hash: string; audit: ReturnType<typeof auditExtraction> };
type Saved = ProviderResult & { hash: string; version: string; modelRequested: string };

const cases: Case[] = caseIds.map(id => {
  const stored = sourceRun.cases.find((c: { case: string }) => c.case === id);
  if (!stored || stored.error || !stored.raw) throw new Error(`Missing valid saved raw output for case ${id}`);
  const filename = fs.readdirSync(path.join(root, "evals/golden")).find(f => f.startsWith(`${id}-`) && f.endsWith(".json"));
  if (!filename) throw new Error(`Missing golden case ${id}`);
  const golden: GoldenCase = JSON.parse(fs.readFileSync(path.join(root, "evals/golden", filename), "utf8"));
  const extraction = (stored.raw.afterAssign ?? stored.raw.initial).orchestratorExtraction;
  if (!extraction || !Array.isArray(extraction.actionItems)) throw new Error(`Missing saved extraction for ${id}`);
  // The source harness run pins Maya as the recorder. Match it explicitly, not by assuming any vendor is You.
  const recorder = "Maya Lindqvist";
  const vendorNames = Object.values(stored.raw.maps.vendorNameById) as string[];
  if (!vendorNames.includes(recorder)) throw new Error(`Recorder missing from case ${id}'s saved vendor team`);
  const request = makeRequest(golden, extraction, recorder, vendorNames);
  return { id, golden, request, hash: requestHash(request), audit: auditExtraction(golden, request) };
});
fs.mkdirSync(out, { recursive: true });
const save = (filename: string, data: unknown) => fs.writeFileSync(path.join(out, filename), JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
save("manifest.json", {
  version: EXPERIMENT_VERSION, source: path.relative(root, source),
  sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
  sourceGit: sourceRun.git, sourceModel: sourceRun.model, cases: caseIds, models: MODELS,
  questionBatchSize: QUESTION_BATCH_SIZE,
  jevTransport,
  checksums: cases.map(c => ({ case: c.id, requestSha256: c.hash, answerKeySha256: createHash("sha256").update(JSON.stringify(c.golden.expected)).digest("hex") })),
  protocol: "Fixed saved extraction, identical state and questions, shared projection/scorer, no production writes. Exploratory error-enriched sample; not held-out.",
  excluded: ["customer matching", "date arithmetic", "priority", "notes quality", "draft prose", "approval execution"],
});
// Requests deliberately exclude expectations and the old Claude decisions.
save("requests.json", cases.map(c => ({ case: c.id, hash: c.hash, ...c.request })));
save("extraction-audit.json", cases.map(c => ({ case: c.id, ...c.audit })));

function loadResult(c: Case, provider: Provider): Saved | null {
  const filename = path.join(out, `${c.id}-${provider}.json`);
  if (!fs.existsSync(filename)) return null;
  const result: Saved = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (result.hash !== c.hash || result.version !== EXPERIMENT_VERSION || result.modelRequested !== MODELS[provider]) {
    throw new Error(`Cached ${c.id}/${provider} has different inputs/protocol/model. Use a fresh --out directory.`);
  }
  return result;
}

function report() {
  const details = cases.map(c => ({ case: c.id, extractionAudit: c.audit, providers: Object.fromEntries((["claude", "jev"] as Provider[]).map(p => {
    const result = loadResult(c, p);
    return [p, result ? { ...evaluate(c.golden, c.request, result.answers), model: result.model, durationMs: result.durationMs, estimatedCostUsd: result.estimatedCostUsd } : null];
  })) }));
  save("scores.json", details);
  const lines = ["# Jev / Claude: offline decision comparison", "", `Protocol: ${EXPERIMENT_VERSION}. Source: ${path.relative(root, source)}.`, "",
    "Exploratory sample selected for known errors and varied behaviour. These are reused development cases, not an independent test set. No production database or application routes are used.", "",
    "Both models receive the exact same saved extraction, transcript, board, people, recorder and Choice questions. Expected answers and historical model decisions are never sent. Claude answers this narrower decision contract; it is not a fresh run of the current production orchestrator.", "",
    "Drafts below are deterministic projections of selected candidates, not Claude-written final drafts. Dates, notes, priority, customer matching and execution are not measured.", "",
    "## Candidate availability (heuristic, needs human checking)", "", "| Case | Expected items with a candidate | Possibly absent upstream |", "|---|---|---|"];
  const safe = (value: unknown) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
  for (const c of cases) lines.push(`| ${c.id} | ${c.audit.matched}/${c.audit.total} | ${safe(c.audit.possiblyMissing.map(e => e.titleLike ?? e.existingTaskRef).join("; "))} |`);
  lines.push("", "## Results", "", "Correct action / owner count missing items as failures. Dependency recall includes gap-tagged expectations. All scores use heuristic title/quote pairing and need a human spot-check. Conditional owner accuracy alone can hide missing tasks.", "",
    "| Model | Completed cases | Correct actions | Correct people | Expected dependencies found | Correct / proposed links | Estimated cost |", "|---|---|---|---|---|---|---|");
  for (const p of ["claude", "jev"] as const) {
    const completed = details.map(d => d.providers[p]).filter(v => v !== null);
    const sum = (key: "correctAction" | "correctOwner" | "correctDependencies" | "dependencyPrecision") => `${completed.reduce((n, v) => n + v.metrics[key].count, 0)}/${completed.reduce((n, v) => n + v.metrics[key].total, 0)}`;
    lines.push(`| ${p} | ${completed.length}/${cases.length} | ${sum("correctAction")} | ${sum("correctOwner")} | ${sum("correctDependencies")} | ${sum("dependencyPrecision")} | $${completed.reduce((n, v) => n + v.estimatedCostUsd, 0).toFixed(4)} |`);
  }
  lines.push("", "A row with incomplete cases is not a result for the whole sample. Compare providers only after both cover all selected cases.", "",
    "| Case | Model | Items found | Wanted / proposed | Correct action | Correct person | Expected dependencies found | Correct / proposed links | Review flags |", "|---|---|---|---|---|---|---|---|---|");
  for (const d of details) for (const p of ["claude", "jev"] as const) {
    const v = d.providers[p];
    if (!v) { lines.push(`| ${d.case} | ${p} | pending | | | | | | |`); continue; }
    const n = (x: { count: number; total: number }) => `${x.count}/${x.total}`;
    lines.push(`| ${d.case} | ${p} | ${n(v.score.totals.recall)} | ${n(v.score.totals.precision)} | ${n(v.metrics.correctAction)} | ${n(v.metrics.correctOwner)} | ${n(v.metrics.correctDependencies)} | ${n(v.metrics.dependencyPrecision)} | ${v.unresolved.length} |`);
  }
  lines.push("", "## Review the actual decisions", "", "Uncertainty is reported; there is no automatic confidence gate or automatic task execution. Jev probabilities are saved; Claude does not supply comparable probabilities.");
  for (const c of cases) {
    lines.push("", `### ${c.id}: ${safe(c.golden.payload.meeting.title)}`, "", "| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |", "|---|---|---|---|");
    for (const candidate of c.request.state.candidates) {
      const decision = (p: Provider) => {
        const r = loadResult(c, p);
        if (!r) return "pending";
        const get = (field: string) => r.answers[`${candidate.id}_${field}`].choice;
        return `${get("action")} / ${get("task")} / ${c.request.state.people[get("owner")]?.name ?? "unknown"}`;
      };
      lines.push(`| ${candidate.id}: ${safe(candidate.claim)} | ${safe(candidate.sourceQuote)} | ${safe(decision("claude"))} | ${safe(decision("jev"))} |`);
    }
    for (const p of ["claude", "jev"] as const) {
      const r = loadResult(c, p);
      if (!r) continue;
      const v = evaluate(c.golden, c.request, r.answers);
      lines.push("", `**${p} dependencies:** ${safe(v.proposals.map(x => `${x.draftRef ?? x.taskRef}: ${JSON.stringify(x.dependsOn)}`).join("; "))}`, "",
        `**${p} review flags:** ${safe(v.unresolved.join("; ") || "none")}`);
    }
  }
  fs.writeFileSync(path.join(out, "REPORT.md"), lines.join("\n") + "\n");
  console.log(`Report: ${path.join(out, "REPORT.md")}`);
}

async function main() {
  console.log(`Prepared ${cases.length} cases / ${cases.reduce((n, c) => n + c.request.state.candidates.length, 0)} fixed candidates. No database connection.`);
  if (values.prepare || values.report) { report(); return; }
  // Check all required keys before any spend. Allow cached completed results without a key.
  for (const p of providers) if (!keys[p] && cases.some(c => !loadResult(c, p))) {
    report();
    throw new Error(`Missing ${p === "jev" ? "AI_GATEWAY_API_KEY (or TYPESAFE_API_KEY)" : "ANTHROPIC_API_KEY"}. Add it to the local env file and use --env <absolute path>; never paste credentials into chat.`);
  }
  let spent = 0;
  try {
    for (const c of cases) for (const p of providers) {
      if (loadResult(c, p)) { console.log(`${c.id}/${p}: reused identical completed request`); continue; }
      console.log(`${c.id}/${p}: ${Object.keys(c.request.questions).length} questions`);
      const entries = Object.entries(c.request.questions);
      const parts: ProviderResult[] = [];
      for (let i = 0; i < entries.length; i += QUESTION_BATCH_SIZE) {
        const request = { state: c.request.state, questions: Object.fromEntries(entries.slice(i, i + QUESTION_BATCH_SIZE)) };
        const hash = requestHash(request);
        const filename = `${c.id}-${p}-part-${Math.floor(i / QUESTION_BATCH_SIZE) + 1}.json`;
        const existing = path.join(out, filename);
        let part: Saved;
        if (fs.existsSync(existing)) {
          part = JSON.parse(fs.readFileSync(existing, "utf8"));
          if (part.hash !== hash || part.version !== EXPERIMENT_VERSION || part.modelRequested !== MODELS[p]) throw new Error(`Cached ${filename} differs; use a fresh --out directory`);
          validateAnswers(request, part.answers);
        } else {
          const response = await callProvider(p, request, keys[p]!, jevTransport);
          part = { ...response, hash, version: EXPERIMENT_VERSION, modelRequested: MODELS[p] };
          save(filename, part);
          spent += part.estimatedCostUsd;
        }
        parts.push(part);
      }
      const result: ProviderResult = {
        model: MODELS[p], answers: Object.assign({}, ...parts.map(part => part.answers)),
        durationMs: parts.reduce((n, part) => n + part.durationMs, 0),
        estimatedCostUsd: parts.reduce((n, part) => n + part.estimatedCostUsd, 0),
        usage: { input_tokens: parts.reduce((n, part) => n + part.usage.input_tokens, 0), output_tokens: parts.reduce((n, part) => n + part.usage.output_tokens, 0) },
        raw: parts.map(part => part.raw),
        transport: p === "jev" ? parts[0].transport : "anthropic",
      };
      validateAnswers(c.request, result.answers);
      save(`${c.id}-${p}.json`, { ...result, hash: c.hash, version: EXPERIMENT_VERSION, modelRequested: MODELS[p] });
      console.log(`${c.id}/${p}: saved, ${(result.durationMs / 1000).toFixed(1)}s, estimated $${result.estimatedCostUsd.toFixed(4)}`);
    }
  } finally {
    report();
    console.log(`Saved new calls estimated total: $${spent.toFixed(4)}. Successful calls are cached; rerunning will reuse them.`);
  }
}

main().catch(error => {
  // SDK error objects can carry request headers. Print a sanitized message only.
  const message = error instanceof Error ? error.message : "Comparison failed";
  console.error(message.replace(/(?:sk-ant-|ts_)[A-Za-z0-9_-]+/g, "[redacted]"));
  process.exitCode = 1;
});
