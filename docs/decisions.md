# Product decisions

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
