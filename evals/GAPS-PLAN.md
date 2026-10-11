# Plan: features the golden-set review asked for

Caroline's review of the golden set (2026-10-11, see `PROGRESS.md`) asked the meeting AI for things it cannot do today, whatever its instructions say, because the product or the AI's tools have no way to express them. This plan builds them. Each one is already written into the answer key with a `gap` code, so the eval shows each feature closing its gap.

## Order

1. **Baseline eval first**, with today's prompt and tools. Without it there is no "before".
2. **Judgement rules in the prompt** (no product change): parked items, date inference, notes, vendor reminders, "right after the call" promises. After run.
3. Then the features below, smallest blast radius first. Re-run the eval after each.

| # | Feature | Gap code | Size | Schema change |
|---|---|---|---|---|
| 1 | Richer updates to existing tasks | `existing_task_notes`, `multi_field_existing_update` | S-M | none |
| 2 | Free-text dependencies | `free_text_dependency`, `existing_task_dependency` | M | yes |
| 3 | Dependencies between drafts from the same meeting | `depends_on_new_draft` | M | none (uses 2) |

---

## 1. Richer updates to existing tasks

**Today:** "update an existing task" can do one thing per draft: reassign, reprioritise, or move the due date. It can't add notes, and changing two things needs two drafts.

**Why it matters:** most of Caroline's existing-task notes were "keep the task, but add what was agreed": scope details, metric names, a corrected due date and owner together (cases 13, 14, 26).

**Build:**
- AI tool `match_to_existing_task_draft` takes a `changes` object instead of a single action: `{ ownerId?, assigneeContactId?, priority?, dueDate?, appendNotes? }`. Keep accepting the old `action` field for drafts already in the database.
- Approve route applies every change in one update, through the same `lib/db` functions as today. `appendNotes` appends with a dated line, never overwrites what a person wrote.
- Inbox card shows the update as a before → after diff per field, editable before approval like create drafts.
- Prompt: "when the call adds information to an existing task, propose it as one update with all changes".

**Tests:** unit tests for payload compatibility (old single-action drafts still approve), e2e for approving a multi-field update.

## 2. Free-text dependencies

**Today:** a task can be blocked by one other task (`blockedByTaskId`). Many real blockers aren't tasks: "platform team sign-off", "security review closes", "customer's offsite ends".

**Build:**
- New table `TaskDependency { id, taskId, blockedByTaskId?, label?, resolvedAt?, createdAt }`: either a task or a text label, and a task can have several. Rollout follows the project's add-then-tighten rule: add the table, backfill one row per existing `blockedByTaskId`, switch reads, then retire the old column in a later migration. Hand-written SQL applied with `prisma db execute` + `migrate resolve` (the shadow-database gotcha in `CLAUDE.md`), **dry-run in a rolled-back transaction first** against a copy, per the production-data rule.
- Board card chip shows text blockers as a plain label next to task-id chips. The drawer's "Blocked by" field accepts either a task or free text. A text blocker can be ticked off (`resolvedAt`).
- Health scoring: decide with Caroline whether an unresolved text blocker counts like a blocked task (open question).
- AI tools: `dependsOn: [{ taskId } | { text }]` on create and on existing-task updates (which closes `existing_task_dependency` too).

## 3. Dependencies between drafts from the same meeting

**Today:** a new task can only depend on a task already on the board. When one meeting produces "add the metrics block" and "migrate the dashboards (needs the metrics block)", the link is lost.

**Build:**
- Each create draft from the AI gets a short `draftRef` ("d1", "d2"); `dependsOn` can name `{ draftRef }`.
- On approval of the dependent task: if the blocker draft is already approved, link to its created task; if it's still pending, store the link and resolve it when the blocker is approved; if the blocker is rejected, fall back to a text dependency with the blocker's title (needs feature 2).
- Inbox shows "depends on draft d1" on the card, and approving both in one bulk action keeps the order right.

## Scoring support (do alongside step 1 of the order)

- `evals/scoring.js` reads the new answer-key fields (`assignee`, `notesContains`, `dependsOn`, `priority`, `kind`, `afterAssign`, `board`) and reports gap expectations as their own metric ("gap expectations met: N of M").
- The runner sets up each case's `board` in an isolated, eval-tagged onboarding, runs the meeting, scores, and deletes it. It never reads the live demo board.

## Open questions for Caroline

- Should an unresolved text blocker turn the onboarding's health red, the same way a blocked task does?
- When the AI appends notes to an existing task, should they be marked as AI-added?
- After approving a meeting's drafts in bulk, should unresolved draft-to-draft links warn before approving only part of the set?
