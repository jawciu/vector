#!/usr/bin/env node
/**
 * Design-system audit scorecard.
 *
 * Measures how much of the app actually goes through the design system:
 * raw-value leakage, inline styling, primitive coverage (count AND ratio),
 * story/TS coverage of the DS layer, and dialog accessibility.
 *
 * The method behind these metrics is documented in docs/DS-PLAN.md (Part A,
 * the seven-lens audit playbook); metric definitions live in
 * docs/ds-audit/README.md. Every pattern is a heuristic grep, tuned for this
 * codebase in the METRICS/SCOPE config below — port to another repo by
 * adjusting that block only.
 *
 * Usage:
 *   npm run audit:ds                        scorecard table
 *   npm run audit:ds -- --json              machine-readable JSON on stdout
 *   npm run audit:ds -- --out <file>        also write the JSON snapshot
 *   npm run audit:ds -- --baseline <file>   compare against a snapshot;
 *                                           exit 1 if any metric regressed
 *                                           (the CI ratchet)
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, relative, dirname, extname } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// SCOPE — what gets scanned. Tune per repo.
// ---------------------------------------------------------------------------
const SCOPE = {
  // Feature + UI code. API routes carry no styling.
  include: ["app"],
  excludeDirs: ["app/api", "node_modules", ".next"],
  extensions: [".js", ".jsx", ".ts", ".tsx"],
  // The DS layer itself. Primitives are ALLOWED to use raw elements/SVGs —
  // wrapping them is their whole job — so several metrics exclude this dir.
  uiDir: "app/ui",
  // Files allowed to contain raw hex, each for a documented reason.
  rawHexAllowlist: [
    "app/ui/Sparkle.tsx", // SVG <stop> colours can't resolve CSS vars reliably (see file comment)
  ],
};

// Stories and meta manifests are DS documentation/scaffolding — they never
// ship in the app bundle, and their layout styles (AllVariants grids etc.)
// are not app drift. Excluded from every drift metric; storyCoverage still
// counts them via the unfiltered ui file list.
const isDsScaffolding = (rel) => /\.(stories|meta)\.|^\.storybook\//.test(rel);

// Primitive names that count as "blessed" button-likes / form controls.
const PRIMITIVE_BUTTONS = ["Button", "IconButton", "MenuTriggerButton", "MenuOption"];
// None exist yet — coverage starts at 0. Add "Field" here ONLY once app/ui/Field.tsx
// ships: FollowUpModal.js + TeamPanel.js have a LOCAL <Field> that must not count.
const PRIMITIVE_INPUTS = ["Input", "Textarea", "Select"];

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    const rel = relative(ROOT, full);
    if (SCOPE.excludeDirs.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
    if (statSync(full).isDirectory()) walk(full, files);
    else if (SCOPE.extensions.includes(extname(name))) {
      files.push({ rel, text: readFileSync(full, "utf8") });
    }
  }
  return files;
}

const allFiles = SCOPE.include.flatMap((d) => walk(resolve(ROOT, d)));
const uiFiles = allFiles.filter((f) => f.rel.startsWith(`${SCOPE.uiDir}/`));
// Drift metrics scan app code only — not stories/meta scaffolding.
const files = allFiles.filter((f) => !isDsScaffolding(f.rel));
const featureFiles = files.filter((f) => !f.rel.startsWith(`${SCOPE.uiDir}/`));

// ---------------------------------------------------------------------------
// Counting helpers
// ---------------------------------------------------------------------------
function countIn(fileList, re) {
  let total = 0;
  const perFile = [];
  for (const f of fileList) {
    const n = (f.text.match(re) ?? []).length;
    if (n > 0) perFile.push({ file: f.rel, count: n });
    total += n;
  }
  perFile.sort((a, b) => b.count - a.count);
  return { total, perFile };
}

function jsxTag(names) {
  return new RegExp(`<(?:${names.join("|")})(?=[\\s/>])`, "g");
}

const pct = (n, total) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
const cov = (n, total) => `${n}/${total} (${pct(n, total)}%)`;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

// Lens 1 — raw-value leakage
const hexFiles = files.filter((f) => !SCOPE.rawHexAllowlist.includes(f.rel));
const rawHex = countIn(hexFiles, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g);
const rawHexValues = [
  ...new Set(
    hexFiles.flatMap((f) => f.text.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g) ?? [])
  ),
].sort();
const rawRgba = countIn(files, /rgba?\(/g);
const inlineStyles = countIn(files, /style=\{\{/g);
const arbitraryTw = countIn(files, /[\w-]-\[(?:#[0-9a-fA-F]{3,8}|[\d.]+(?:px|rem|vh|vw|%))\]/g);
const hardcodedGeometry = countIn(
  files,
  /(?:borderRadius|padding(?:Top|Right|Bottom|Left)?|margin(?:Top|Right|Bottom|Left)?|gap|fontSize)\s*:\s*["']?\d/g
);

// Lens 2 — primitive coverage (feature code only; primitives may use raw elements)
const rawButtons = countIn(featureFiles, jsxTag(["button"]));
const primButtons = countIn(featureFiles, jsxTag(PRIMITIVE_BUTTONS));
const rawInputs = countIn(featureFiles, jsxTag(["input", "textarea", "select"]));
const primInputs = countIn(featureFiles, jsxTag(PRIMITIVE_INPUTS));
const scatteredSvg = countIn(featureFiles, /<svg(?=[\s>])/g);
const centralSvg = countIn(
  files.filter((f) => f.rel.startsWith(`${SCOPE.uiDir}/`)),
  /<svg(?=[\s>])/g
);

// DS-layer maturity
const uiComponentFiles = uiFiles.filter(
  (f) => !/\.(stories|meta|test)\.|\/(cn|ds-meta)\./.test(f.rel)
);
const storyFiles = uiFiles.filter((f) => /\.stories\./.test(f.rel));
const tsUiFiles = uiComponentFiles.filter((f) => /\.tsx?$/.test(f.rel));

// Lens 4 — dialog a11y: scrim-pattern files with no dialog semantics
const dialogFiles = featureFiles
  .filter((f) => /fixed inset-0/.test(f.text) && /rgba\(0,\s*0,\s*0/.test(f.text))
  .map((f) => ({
    file: f.rel,
    hasA11y: /role="dialog"|aria-modal|<dialog(?=[\s>])/.test(f.text),
  }));
const dialogsMissingA11y = dialogFiles.filter((d) => !d.hasA11y);

// ---------------------------------------------------------------------------
// Snapshot — flat numbers only, so baselines diff cleanly
// ---------------------------------------------------------------------------
const metrics = {
  rawHexTotal: rawHex.total,
  rawHexDistinct: rawHexValues.length,
  rawRgba: rawRgba.total,
  inlineStyles: inlineStyles.total,
  arbitraryTw: arbitraryTw.total,
  hardcodedGeometry: hardcodedGeometry.total,
  rawButtons: rawButtons.total,
  primitiveButtons: primButtons.total,
  buttonCoveragePct: pct(primButtons.total, primButtons.total + rawButtons.total),
  rawInputs: rawInputs.total,
  primitiveInputs: primInputs.total,
  inputCoveragePct: pct(primInputs.total, primInputs.total + rawInputs.total),
  scatteredSvg: scatteredSvg.total,
  centralSvg: centralSvg.total,
  iconCoveragePct: pct(centralSvg.total, centralSvg.total + scatteredSvg.total),
  uiComponents: uiComponentFiles.length,
  storyFiles: storyFiles.length,
  storyCoveragePct: pct(storyFiles.length, uiComponentFiles.length),
  tsUiFiles: tsUiFiles.length,
  tsCoveragePct: pct(tsUiFiles.length, uiComponentFiles.length),
  dialogsMissingA11y: dialogsMissingA11y.length,
};

// Which way is better, per metric — drives the ratchet.
const LOWER_IS_BETTER = new Set([
  "rawHexTotal", "rawHexDistinct", "rawRgba", "inlineStyles", "arbitraryTw",
  "hardcodedGeometry", "rawButtons", "rawInputs", "scatteredSvg", "dialogsMissingA11y",
]);
const HIGHER_IS_BETTER = new Set([
  "buttonCoveragePct", "inputCoveragePct", "iconCoveragePct",
  "storyCoveragePct", "tsCoveragePct", "primitiveButtons", "primitiveInputs",
  "storyFiles", "tsUiFiles",
]);

const snapshot = {
  generatedAt: new Date().toISOString().slice(0, 10),
  scannedFiles: files.length,
  metrics,
  details: {
    rawHexValues,
    rawHexFiles: rawHex.perFile,
    worstInlineStyleFiles: inlineStyles.perFile.slice(0, 8),
    worstRawButtonFiles: rawButtons.perFile.slice(0, 8),
    dialogFiles,
  },
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};

if (flag("--out")) {
  const out = resolve(ROOT, String(flag("--out")));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.error(`✓ Wrote ${relative(ROOT, out)}`);
}

if (flag("--json")) {
  console.log(JSON.stringify(snapshot, null, 2));
} else {
  const m = metrics;
  const rows = [
    ["— Lens 1 · raw-value leakage —", ""],
    ["Raw hex literals", `${m.rawHexTotal} (${m.rawHexDistinct} distinct)`],
    ["Raw rgb()/rgba()", m.rawRgba],
    ["Inline style={{}} objects", m.inlineStyles],
    ["Arbitrary Tailwind values", m.arbitraryTw],
    ["Hardcoded geometry in styles", m.hardcodedGeometry],
    ["— Lens 2 · primitive coverage (count + ratio) —", ""],
    ["Button coverage", cov(m.primitiveButtons, m.primitiveButtons + m.rawButtons)],
    ["  raw <button> in feature code", m.rawButtons],
    ["Input coverage", cov(m.primitiveInputs, m.primitiveInputs + m.rawInputs)],
    ["  raw <input>/<textarea>/<select>", m.rawInputs],
    ["Icon centralisation", cov(m.centralSvg, m.centralSvg + m.scatteredSvg)],
    ["  inline <svg> in feature code", m.scatteredSvg],
    ["— DS-layer maturity —", ""],
    ["Story coverage of app/ui", cov(m.storyFiles, m.uiComponents)],
    ["TypeScript coverage of app/ui", cov(m.tsUiFiles, m.uiComponents)],
    ["— Lens 4 · dialog a11y —", ""],
    ["Modal shells missing dialog semantics", m.dialogsMissingA11y],
  ];
  const w = Math.max(...rows.map(([l]) => l.length));
  console.log(`\nDS audit — ${snapshot.generatedAt} — ${files.length} files scanned\n`);
  for (const [label, value] of rows) {
    console.log(value === "" ? `\n${label}` : `  ${label.padEnd(w)}  ${value}`);
  }
  console.log(`\nWorst inline-style files:`);
  for (const f of snapshot.details.worstInlineStyleFiles.slice(0, 5)) {
    console.log(`  ${String(f.count).padStart(4)}  ${f.file}`);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Ratchet — compare against a committed baseline, fail on regression
// ---------------------------------------------------------------------------
if (flag("--baseline")) {
  const baseline = JSON.parse(readFileSync(resolve(ROOT, String(flag("--baseline"))), "utf8"));
  const regressions = [];
  for (const [key, value] of Object.entries(metrics)) {
    const prev = baseline.metrics?.[key];
    if (prev === undefined || value === prev) continue;
    const worse =
      (LOWER_IS_BETTER.has(key) && value > prev) ||
      (HIGHER_IS_BETTER.has(key) && value < prev);
    console.log(`${worse ? "✗" : "✓"} ${key}: ${prev} → ${value}${worse ? "  (REGRESSION)" : ""}`);
    if (worse) regressions.push(key);
  }
  if (regressions.length > 0) {
    console.error(`\n✗ ${regressions.length} metric(s) regressed vs baseline. The DS only ratchets forward.`);
    process.exit(1);
  }
  console.log("\n✓ No regressions vs baseline.");
}
