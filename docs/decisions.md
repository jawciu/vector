# Product decisions

## 2026-10-18 — Complete meeting draft batches and preserved execution details

Pass 2 submits one complete proposal batch, decoded into the existing draft
shapes before validation and persistence. Separate tool calls in a single
response had omitted work the model had already planned. Dependencies describe
relationships between drafts; waiting for a prerequisite does not postpone
drafting the dependent work. Owned review/approval requests are actions too.

Extraction carries execution facts across turns in `details[]`; drafting uses
them as a checklist for task notes. Keep routine meeting administration and
unchanged-task restatements out of task drafts. A specific requested deliverable
explicitly noted for later is still tracked as undated work, without treating
speculative future product ideas as commitments. Evaluation evidence and
remaining limitations live in `evals/quality-investigation/README.md`.

## 2026-10-18 — Single-line dependency names in task drafts

Keep each dependency name on one line in previews and editor tags. Truncate
long names with an ellipsis and retain the full name in the title attribute.
Multiple dependencies may occupy separate rows, but each entry stays one line.

## 2026-10-18 — Square checkboxes select draft cards

Use the shared dropdown `Checkbox` for bulk selection on create-task and
update-task draft cards. Its empty square, hover outline and checked fill make
selection distinct from circular task completion. Keep the existing selection
and bulk-action behavior.

## 2026-10-18 — Compact task draft notes and aligned metadata

Create-task and update-task previews retain two columns, showing only a note icon and bold count of 1 when
a note exists, regardless of its length. Full note text remains in Edit so long
notes cannot inflate review cards. Remove the create-task comment indicator,
which has no corresponding editor field. Right-align update metadata to match
create-task previews.

## 2026-10-18 — Text dependencies do not affect onboarding health

Caroline confirmed that waiting on an external event or prerequisite is not itself
a blocked task. Text dependencies remain useful context and do not change health.
Keep `TEXT_BLOCKERS_COUNT_AS_BLOCKED = false` in the shared health calculation.
An explicitly Blocked task continues to affect health through the existing rule.

## 2026-10-18 — Quiet warnings and clear proposed changes

Unavailable owner/assignee and unknown-recorder warnings share an alert-coloured
message and warning icon, with no enclosing border and neutral resolution
pickers. Avoid multiplying yellow treatments around the same warning.

Existing-task updates show identity once, in the left column. Reuse
`UpdateDiffRow` for field changes: current value → bold proposed value, including
**none** for removals. Current values use the lightest off-white (`text`) on card hover or
keyboard focus within. The canonical visual rules are in `DESIGN.md`.

## 2026-10-18 — Consistent dependency row checkboxes

Every dependency row uses a checkbox. Linked-task dependencies use a disabled
checkbox reflecting the linked task's Done status, including strikethrough when
complete. Typed dependencies keep their interactive resolve/reopen checkbox.
The Dependencies icon belongs on the group heading, not on individual rows.
Remove remains available for both kinds. This separates completion from removal
while keeping the list visually consistent.

## 2026-10-18 — Dependencies appear on the dependent draft

Remove the reverse dependency notice from prerequisite create-task cards. For
example, Add returns metrics is a plain create-task suggestion; Migrate returns
dashboard carries the dependency on Add returns metrics. Keep the actual link
and dismissal behavior. This avoids repeating the relationship on both cards.

## 2026-10-18 — Plain dependency names across task drafts

Draft previews and edit forms share `DraftDependencies`: show the dependency
name at 14px without a border, "Depends on" prefix, meeting parenthetical or
approval/link-state explanation. The group supplies its dependency icon/label.
Retain task IDs for existing tasks and Remove in edit mode. Use the same plain
treatment for draft links, existing tasks and typed dependencies. Internal link
resolution and approval behavior remain unchanged.

## 2026-10-18 — Dependency tags inside the draft editor field

Replace the dependency count and detached list with removable 14px tags inside
one field. Multiple tags wrap; an Add control opens the existing task picker.
Use `DraftDependenciesField` for both create-task and update-task draft editors.
Keep the field available when empty and restore focus after removing its last
tag. Keep previews as plain names, without tag fills or workflow explanations.

## 2026-10-18 — Show prerequisite drafts before dependent drafts

Within the existing meeting/date groups, order task drafts so each prerequisite
appears before tasks that depend on it. Follow explicit draft/task references,
not text-title guesses. Preserve incoming order where dependencies do not require
a move. Invalid cycles retain the original group order, without dropping cards.
This changes display order only, not approval order or the underlying links.

## 2026-10-18 — Keep a dependency when its prerequisite suggestion is dismissed

Caroline approved Review 4C's current behavior: dismissing the proposed metrics
task does not remove the dashboard's dependency on that work. Keep its name as a
typed dependency on the dependent task, which can later be resolved or removed
manually. Dismissal rejects a suggested task; it does not mean the prerequisite
work is no longer needed. No implementation change is required.

## 2026-10-18 — Recorder identity follow-up and intended draft routing

Ian is adding per-meeting recorder identity in Miniti. Caroline asked to keep
the Vector mapping as a to-do for when that contract is available. Track the
work and acceptance cases in `evals/GAPS-PLAN.md`; do not guess the new schema.

Caroline confirmed that new-task and task-update suggestions should remain in
the onboarding's shared Actions view, including unowned suggestions. They do not
need a personal-reviewer fallback. Follow-up email drafts remain owner-filtered
in the interface. Their edit/approve/reject routes currently check authentication
without enforcing the same owner-only boundary; explained this distinction, with
no permission changes requested or made.

## 2026-10-18 — Task grouping for implementation, PRs and pending choices

Caroline confirmed that implementation and opening its PR are one task, with
the technical scope, constraints and reviewer instructions in that task. Case 16
now expects two tasks total: combined implementation/PR and the vendor review.
The old answer key is archived; old model outputs must be rescored against the
same revised key for comparison. This changes the expected count, not model quality.

When extra workshop attendees are undecided and the vendor promises to adjust
once numbers are known, keep a separate undated vendor follow-up reminder.
Context on the main workshop task does not replace that reminder. The pending
customer choice can remain a typed dependency, which does not affect health.
