/** Combine disjoint confirmation parts without any database or model calls.
 * Usage: npx tsx evals/quality-investigation/combine.ts <part> <part> <part> <out> */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { summarise, summaryLines, type CaseScore } from "../scoring";

type CaseRecord = { case: string; score: CaseScore | null; error: string | null; llmTrace?: { request: { tools?: unknown; system?: { text: string }[]; thinking?: unknown; output_config?: unknown; temperature?: number; max_tokens?: number } }[] };
type Run = { label: string; complete?: boolean; cases: CaseRecord[]; totalCostUsd: number; model: string; mockLlm: boolean; clockShift: boolean; git: unknown };
const args = process.argv.slice(2);
if (args.length !== 4) throw new Error("Pass three run parts and one new output path");
const parts = args.slice(0, 3).map((file) => JSON.parse(readFileSync(file, "utf8")) as Run);
if (parts.some((r) => !r.complete || r.mockLlm || !r.clockShift || r.model !== "claude-sonnet-4-6")) throw new Error("Confirmation parts must be complete real Sonnet runs with clock shift");
const cases = parts.flatMap((r) => r.cases).sort((a, b) => a.case.localeCompare(b.case));
const expected = Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, "0"));
if (JSON.stringify(cases.map((c) => c.case)) !== JSON.stringify(expected)) throw new Error("Parts must contain each case 01–30 exactly once");
const signatures = { extraction: new Set<string>(), decision: new Set<string>() };
for (const c of cases) {
  for (const { request } of c.llmTrace ?? []) {
    const body = { tools: request.tools, system: request.system?.[0]?.text.split("Today is")[0], thinking: request.thinking, output_config: request.output_config, temperature: request.temperature, max_tokens: request.max_tokens };
    signatures[request.tools ? "decision" : "extraction"].add(createHash("sha256").update(JSON.stringify(body)).digest("hex"));
  }
}
if (signatures.decision.size !== 1 || signatures.extraction.size !== 1) throw new Error("Confirmation contains different extraction/decision prompts or generation settings");
const summary = summarise(cases.map((c) => c.score));
const report = {
  version: 3, label: path.basename(args[3], ".json").replace(/^\d{4}-\d{2}-\d{2}-/, ""), createdAt: new Date().toISOString(),
  git: parts[0].git, model: parts[0].model, mockLlm: false, clockShift: true,
  complete: true, caseCount: 30, selectedCaseCount: 30,
  totalCostUsd: Number(parts.reduce((sum, r) => sum + r.totalCostUsd, 0).toFixed(6)),
  combinedFrom: args.slice(0, 3).map((file) => path.relative(process.cwd(), path.resolve(file))),
  decisionRequestSignature: [...signatures.decision][0], extractionRequestSignature: [...signatures.extraction][0], summary, cases,
};
writeFileSync(args[3], JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(summaryLines(summary).join("\n"));
console.log(`Estimated cost: $${report.totalCostUsd.toFixed(4)}; ${cases.filter((c) => c.error).length} case errors`);
