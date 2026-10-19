/**
 * Static checks for the golden dataset. No DB, no API, no network.
 *
 *   node evals/validate-golden.mjs
 *
 * Exits 1 if any case breaks a rule. See evals/golden/README.md for the fields.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText, titleSimilarity } from "./scoring.ts";

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "golden");
const ACTIONS = new Set(["create_task", "match_existing", "update_status", "flag_no_action_items"]);
const GAPS = new Set([
  "free_text_dependency",
  "depends_on_new_draft",
  "existing_task_notes",
  "existing_task_dependency",
  "multi_field_existing_update",
]);
const KINDS = new Set(["commitment", "parked_for_later", "vendor_reminder"]);
const STATUSES = new Set(["Not started", "In progress", "Under investigation", "Blocked", "Done"]);
// A real vendor name that must never appear in the dataset. Stored reversed so the name itself
// never appears in the repo either.
const FORBIDDEN_NAME = new RegExp("hsadthgil".split("").reverse().join(""), "i");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Phrases that would mean the analytics product is still called Vector.
const PRODUCT_AS_VECTOR = /in vector\b|vector static|vector cloud|into vector|vector'?s ips|vector reads|vector-integration/i;

const errors = [];
const stats = { cases: 0, toolCalls: {}, afterAssignToolCalls: 0, gaps: {}, boards: 0, boardTasks: 0 };
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const asList = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

function countGaps(node) {
  if (Array.isArray(node)) return node.forEach(countGaps);
  if (!node || typeof node !== "object") return;
  for (const g of asList(node.gap)) stats.gaps[g] = (stats.gaps[g] ?? 0) + 1;
  for (const v of Object.values(node)) if (typeof v === "object") countGaps(v);
}

function checkGapCodes(file, node, where) {
  if (Array.isArray(node)) return node.forEach((n, i) => checkGapCodes(file, n, `${where}[${i}]`));
  if (!node || typeof node !== "object") return;
  for (const g of asList(node.gap)) if (!GAPS.has(g)) err(file, `${where}: unknown gap code "${g}"`);
  for (const [k, v] of Object.entries(node)) if (typeof v === "object") checkGapCodes(file, v, `${where}.${k}`);
}

function checkToolCalls(file, calls, { transcript, board, label }) {
  const people = new Set([
    ...(board?.contacts ?? []).map((c) => c.name),
    ...(board?.vendorUsers ?? []).map((u) => u.name),
  ]);
  const vendorNames = new Set((board?.vendorUsers ?? []).map((u) => u.name));
  const tasksByRef = new Map((board?.tasks ?? []).map((t) => [t.ref, t]));
  const newTitles = calls.filter((c) => c.action === "create_task").map((c) => c.titleLike);

  calls.forEach((c, i) => {
    const where = `${label}[${i}]`;
    if (label === "toolCalls") stats.toolCalls[c.action] = (stats.toolCalls[c.action] ?? 0) + 1;
    if (!ACTIONS.has(c.action)) err(file, `${where}: unknown action "${c.action}"`);

    if (c.sourceQuoteContains != null) {
      if (!normalizeText(transcript).includes(normalizeText(c.sourceQuoteContains))) {
        err(file, `${where}: sourceQuoteContains not in transcript: "${c.sourceQuoteContains}"`);
      }
    }
    if (c.dueDate !== undefined && c.dueDate !== null && !ISO.test(c.dueDate)) err(file, `${where}: bad dueDate ${c.dueDate}`);
    if (c.newDueDate !== undefined && !ISO.test(c.newDueDate)) err(file, `${where}: bad newDueDate ${c.newDueDate}`);
    if (c.kind !== undefined && !KINDS.has(c.kind)) err(file, `${where}: unknown kind "${c.kind}"`);
    if (c.notesContains !== undefined && (!Array.isArray(c.notesContains) || c.notesContains.length === 0)) {
      err(file, `${where}: notesContains must be a non-empty array`);
    }

    if (c.titleAlternatives !== undefined) {
      if (!Array.isArray(c.titleAlternatives) || c.titleAlternatives.length === 0 || c.titleAlternatives.some((t) => typeof t !== "string" || !t)) {
        err(file, `${where}: titleAlternatives must be a non-empty array of strings`);
      }
      if (c.action !== "create_task") err(file, `${where}: titleAlternatives only applies to create_task`);
    }
    for (const ph of c.notesContains ?? []) {
      // Single words are near-free to match; the review asked for specific phrases.
      // (Code identifiers like fct_applications or snake_case are fine.)
      if (/^[A-Za-z]+$/.test(String(ph).trim())) err(file, `${where}: notesContains "${ph}" is a single word; use a specific phrase`);
    }

    if (c.action === "create_task") {
      if (!c.titleLike) err(file, `${where}: create_task without titleLike`);
      if (!board) err(file, `${where}: create_task but the case has no board`);
      if (c.assignee && board && !people.has(c.assignee)) err(file, `${where}: assignee "${c.assignee}" not on board`);
      if (c.assignee && board && c.owner) {
        const isVendor = vendorNames.has(c.assignee);
        if ((c.owner === "vendor") !== isVendor) err(file, `${where}: owner "${c.owner}" disagrees with assignee "${c.assignee}"`);
      }
      // A create_task must not duplicate an open board task.
      for (const t of board?.tasks ?? []) {
        for (const title of [c.titleLike, ...(c.titleAlternatives ?? [])]) {
          if (t.status !== "Done" && titleSimilarity(t.title, title) >= 0.6) {
            err(file, `${where}: title "${title}" looks like open board task ${t.ref} "${t.title}"`);
          }
        }
      }
    }

    if (c.action === "match_existing" || c.action === "update_status") {
      if (board) {
        if (!c.existingTaskRef) err(file, `${where}: ${c.action} without existingTaskRef`);
        const target = tasksByRef.get(c.existingTaskRef);
        if (!target) err(file, `${where}: existingTaskRef "${c.existingTaskRef}" not on board`);
        else if (target.status === "Done") err(file, `${where}: target ${target.ref} is already Done`);
        if (c.existingTaskTitleContains) {
          const needle = normalizeText(c.existingTaskTitleContains);
          const open = board.tasks.filter((t) => t.status !== "Done" && normalizeText(t.title).includes(needle));
          if (open.length !== 1 || open[0].ref !== c.existingTaskRef) {
            err(file, `${where}: existingTaskTitleContains "${c.existingTaskTitleContains}" resolves to [${open.map((t) => t.ref)}], expected ${c.existingTaskRef}`);
          }
        }
        if (c.assignee && !people.has(c.assignee)) err(file, `${where}: assignee "${c.assignee}" not on board`);
      }
      if (c.newPriority && !["low", "medium", "high"].includes(c.newPriority)) err(file, `${where}: bad newPriority`);
      if (c.newStatus && !STATUSES.has(c.newStatus)) err(file, `${where}: bad newStatus`);
    }

    for (const d of asList(c.dependsOn)) {
      const kinds = ["existingTaskRef", "newTaskTitleLike", "freeText"].filter((k) => d[k] !== undefined);
      if (kinds.length !== 1) err(file, `${where}: dependsOn needs exactly one of existingTaskRef/newTaskTitleLike/freeText`);
      if (d.existingTaskRef && !tasksByRef.has(d.existingTaskRef)) err(file, `${where}: dependsOn.existingTaskRef "${d.existingTaskRef}" not on board`);
      if (d.newTaskTitleLike) {
        const ok = newTitles.some((t) => t !== c.titleLike && titleSimilarity(t, d.newTaskTitleLike) >= 0.6);
        if (!ok) err(file, `${where}: dependsOn.newTaskTitleLike "${d.newTaskTitleLike}" matches no other create_task in this case`);
        if (!asList(d.gap).includes("depends_on_new_draft")) err(file, `${where}: dependsOn a new draft must carry gap depends_on_new_draft`);
      }
      if (d.freeText && !asList(d.gap).includes("free_text_dependency")) err(file, `${where}: free-text dependsOn must carry gap free_text_dependency`);
      if (c.action === "match_existing" && !asList(d.gap).includes("existing_task_dependency")) {
        err(file, `${where}: dependsOn on an existing task update must carry gap existing_task_dependency`);
      }
    }
    if (c.action === "match_existing" && c.notesContains && !asList(c.gap).includes("existing_task_notes")) {
      err(file, `${where}: notesContains on an existing task must carry gap existing_task_notes`);
    }
    if (c.action === "match_existing") {
      const changes = ["newDueDate", "newPriority"].filter((k) => c[k] !== undefined).length;
      if (changes > 1 && !asList(c.gap).includes("multi_field_existing_update")) {
        err(file, `${where}: more than one supported field change needs gap multi_field_existing_update`);
      }
    }
  });
}

const files = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".json")).sort();
const seenNumbers = new Set();
for (const file of files) {
  stats.cases += 1;
  const num = file.slice(0, 2);
  if (seenNumbers.has(num)) err(file, `duplicate case number ${num}`);
  seenNumbers.add(num);

  const rawText = readFileSync(path.join(GOLDEN_DIR, file), "utf8");
  if (FORBIDDEN_NAME.test(rawText)) err(file, "mentions a forbidden vendor name");
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    err(file, `does not parse: ${e.message}`);
    continue;
  }
  const { payload, board, expected } = data;
  const meeting = payload?.meeting ?? {};
  const transcript = (meeting.transcript ?? []).map((t) => t.text).join("\n");

  // Fiction: the analytics product is Quarry; Vector is only the onboarding tool.
  const meetingText = JSON.stringify({ ...meeting, attendees: undefined });
  const hit = meetingText.match(PRODUCT_AS_VECTOR);
  if (hit) err(file, `meeting text still treats Vector as the analytics product ("${hit[0]}")`);
  for (const a of meeting.attendees ?? []) {
    if (/vector\.test$/.test(a.email) && a.domain !== "vector.test") err(file, `vendor attendee ${a.email} lost its vector.test domain`);
  }

  if (!expected?.review?.verdict || expected.review.reviewedAt !== "2026-10-11") err(file, "missing expected.review stamp");
  if (!expected?.notes) err(file, "missing expected.notes");

  if (board) {
    stats.boards += 1;
    stats.boardTasks += board.tasks.length;
    const refs = new Set();
    const people = new Set([...board.contacts.map((c) => c.name), ...board.vendorUsers.map((u) => u.name)]);
    const vendorNames = new Set(board.vendorUsers.map((u) => u.name));
    for (const t of board.tasks) {
      if (refs.has(t.ref)) err(file, `board: duplicate ref ${t.ref}`);
      refs.add(t.ref);
      if (!STATUSES.has(t.status)) err(file, `board ${t.ref}: bad status "${t.status}"`);
      if (!people.has(t.ownerName)) err(file, `board ${t.ref}: ownerName "${t.ownerName}" not in contacts/vendorUsers`);
      if ((t.owner === "vendor") !== vendorNames.has(t.ownerName)) err(file, `board ${t.ref}: owner side disagrees with ownerName`);
      if (t.dueDate !== null && !ISO.test(t.dueDate)) err(file, `board ${t.ref}: bad dueDate`);
    }
    for (const t of board.tasks) if (t.blockedBy && !refs.has(t.blockedBy)) err(file, `board ${t.ref}: blockedBy "${t.blockedBy}" not on board`);
    const expectedPrefix = expected?.match?.companyPrefix ?? expected?.afterAssign?.companyPrefix;
    if (board.companyPrefix !== expectedPrefix) err(file, `board.companyPrefix ${board.companyPrefix} != expected ${expectedPrefix}`);
  }

  checkGapCodes(file, expected, "expected");
  countGaps(expected);
  checkToolCalls(file, expected?.toolCalls ?? [], { transcript, board, label: "toolCalls" });
  if (expected?.afterAssign) {
    if (expected.match?.ambiguous !== true) err(file, "afterAssign only makes sense on an ambiguous case");
    if ((expected.toolCalls ?? []).length) err(file, "ambiguous case should expect no tool calls before assignment");
    stats.afterAssignToolCalls += expected.afterAssign.toolCalls.length;
    checkToolCalls(file, expected.afterAssign.toolCalls, { transcript, board, label: "afterAssign.toolCalls" });
  }
}

console.log(`cases: ${stats.cases}, boards: ${stats.boards} (${stats.boardTasks} board tasks)`);
console.log(`tool calls (before assignment): ${JSON.stringify(stats.toolCalls)}`);
console.log(`tool calls after assignment (ambiguous cases): ${stats.afterAssignToolCalls}`);
console.log(`gaps keyed: ${JSON.stringify(stats.gaps)}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nOK: all golden cases pass the static checks.");
