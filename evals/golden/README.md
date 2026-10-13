# Golden dataset

30 hand-written meetings, each with the answer we expect from Vector's AI. A case file is
`NN-<company>-<what-it-tests>.json` and has three parts:

- `payload`: the Miniti webhook body exactly as Vector would receive it (`event` + `meeting`).
- `board`: the onboarding board as it stands when the meeting arrives (see below).
- `expected`: which onboarding the meeting should match, and which drafts the AI should propose.

Last reviewed by Caroline on 2026-10-11. The review and what came out of it are summarised in
`evals/PROGRESS.md`.

Check the files with `node evals/validate-golden.mjs` (no database, no API calls).

> **Scoring:** `evals/run-golden.ts` seeds each case's `board` in a throwaway local Postgres,
> replays the meeting and scores every field below with `evals/scoring.ts`. How to run it and
> what each metric means: `evals/README.md`.

## The fiction

Vector is only the onboarding tool. The analytics product the customers are onboarding onto is
**Quarry Analytics** ("Quarry"), a fictional vendor. The vendor-side people (Maya Lindqvist,
Theo Okonkwo, Sam Whitfield, Ines Ferreira, Caroline) work at Quarry and use Vector internally.
In transcripts, people build dashboards *in Quarry*, add *Quarry's* static IPs, and so on.
Their emails stay `@vector.test` because Vector's meeting matcher uses that domain to tell vendor
attendees from customer attendees. Never name a real BI vendor as the analytics product.

## Renamed case

`20-flockfreight-no-actions.json` is now `20-flockfreight-vendor-reminder.json`. Caroline decided
it is not a no-action meeting: nothing goes on the overwhelmed customer's plate, but the vendor
owner gets a reminder to circle back. The review file keeps its old name.

## `board`

The board the AI sees when the meeting arrives. Every case has one except 24 (it must stay
ambiguous, so no board applies). For the ambiguous cases 15, 16 and 17, the board belongs to the
company named in `expected.afterAssign.companyPrefix`.

- `companyPrefix`, `companyName`: the customer.
- `contacts`: customer-side people (`name`, `email`). Attendees plus anyone named on the call.
  In the anonymous transcripts the customer is "Speaker 1" / "Speaker 2" with no email.
- `vendorUsers`: Quarry people who use Vector. "You" is the person who recorded an anonymous call.
- `tasks`: each has `ref` (t1, t2...), `title`, `status` (Not started / In progress / Blocked /
  Done), `owner` (vendor or customer), `ownerName`, `dueDate` (or null), `priority` (or null),
  `notes`, and `blockedBy` (another task's ref, or null).

Boards hold the tasks a case relies on (open, so updating them makes sense) plus a few plausible
other tasks, so the AI has to pick the right one and must not duplicate anything already there.

## `expected`

### `match`
`{ "companyPrefix": "MDL" }` for a clear match, or `{ "ambiguous": true }` when the meeting cannot
be tied to one onboarding and must wait in "Needs your input".

### `afterAssign` (ambiguous cases only)
What should happen once a human assigns the ambiguous meeting: `companyPrefix` (the company we
picked, reasoning in `notes`) and `toolCalls`, same format as below. Before assignment the case
still expects no drafts at all.

### `toolCalls`
The drafts we expect, one object per draft. `action` is one of `create_task`, `match_existing`
(change an existing task), `update_status`, or `flag_no_action_items`.

### `notes`
What the case tests, in plain English.

### `review`
`{ verdict, reviewedAt, by }`: Caroline's verdict on the case (approved / change / unsure).

## Fields on a `create_task`

### `titleLike`
Roughly what the title should say. Matched by word overlap, not exact text.

### `titleAlternatives`
Optional list of other acceptable wordings. The scorer pairs on whichever of `titleLike` and these
is closest. Keep titles to the core of the task; scope and specifics belong in `notesContains`.

### `owner`
`vendor` (someone at Quarry) or `customer`. Follows whoever made the promise, not whoever
asked for it.

### `assignee`
The person's name, as it appears in the board's contacts or vendorUsers.

### `dueDate`
`YYYY-MM-DD`. `null` means "explicitly no date". If the field is missing, the date is not scored
(used when the timing is only relative, like "within a day of the PR landing").

### `dueDateReason`
One line explaining an inferred or deliberately empty date, e.g.
`'early next week' from Thu 18 Jun → Tue 23 Jun`. Documentation for humans; not scored.

### `priority`
`low`, `medium` or `high`. Only present when someone actually set one.

### `notesContains`
Short phrases that must appear in the task's description or notes: the specifics from the call
that someone doing the task would need (scope, metric names, audience, who to send it to).
Matched loosely: case and punctuation do not matter, numbers may be written as digits or
words ("four" = "4"), plurals and simple tenses match ("dashboards" = "dashboard"), and the
phrase's words must appear in order and close together. Use a specific multi-word phrase, never a
single common word: one word matches almost anything (the validator rejects it).

### `dependsOn`
What the task waits on. One object, or a list of them. Each object has exactly one of:

- `{ "existingTaskRef": "t1" }`: a task already on the board.
- `{ "newTaskTitleLike": "..." }`: another draft from the same meeting.
- `{ "freeText": "platform team sign-off" }`: something that is not a task at all.

### `sourceQuoteContains`
A phrase from the transcript the draft should quote. Must appear word for word in the transcript.

### `kind`
- `commitment`: someone promised to do it.
- `parked_for_later`: deliberately not now, but someone owns remembering it (no due date).
- `vendor_reminder`: nothing for the customer; a nudge for the vendor owner to circle back.

## Fields on a `match_existing` / `update_status`

### `existingTaskRef`
The board task (t1...) the draft must point at. This is what "link to the existing task" means:
the draft updates that task instead of creating a new one.

### `existingTaskTitleContains`
A fragment of that task's title. Kept so the current scorer can find the task in the database.

### `newStatus`, `newDueDate`, `newPriority`
The change we expect. Only the fields that should change are present.

### `assignee`
Who should own the task after the update. If it is the same person the board already shows,
it is a check ("the owner is right"), not a reassignment.

### `notesContains`, `dependsOn`
Same meaning as on `create_task`. On an existing task the AI adds them through the update's
`changes` (`appendNotes` since GAPS-PLAN feature 1, `dependsOn` since feature 2); they keep their
gap codes so the gap metric shows the features closing them.

## `gap`: expectations the AI cannot meet yet

Some expectations need a capability the AI's tools do not have. They are still written down
(they are what Caroline wants), but marked with `gap` so the scorer can report them separately
instead of counting them as plain failures.

`gap` is a code, or a list of codes. It sits on the `dependsOn` object it is about, or on the tool
call itself for whole-call issues and for `notesContains` on an existing task. The supported
fields on the same call are still scored normally.

| Code | Meaning |
|---|---|
| `free_text_dependency` | The task waits on something that is not a task ("security sign-off"). |
| `depends_on_new_draft` | The task waits on another draft from the same meeting. Today a draft can only point at a task that already exists. |
| `existing_task_notes` | Adding notes to an existing task. |
| `existing_task_dependency` | Adding a dependency to an existing task. |
| `multi_field_existing_update` | One existing-task change needs more than one of reassign / reprioritise / due date. (No case needs it today.) |

## Judgement rules

These are Caroline's rules from the 2026-10-11 review. The cases encode them; they will become
prompt rules for the AI.

1. **Parked items become undated tasks when someone owns remembering them.** If someone says
   "I'll note it", "noted for later", or it is a real future need, create a task with no due date,
   owned by whoever should remember it. Pure thinking out loud that nobody owns stays out.
   (Cases 01, 04, 26, 27, 30. Contrast 18, where it is just musing.)
2. **Infer due dates from vague or anchored phrases**, using the meeting date: "early next week"
   from a Thursday is the Tuesday; "before the training session on Tue 7 Jul" is Mon 6 Jul;
   "by Tuesday" is the coming Tuesday. (Cases 06, 13, 15, 16, 17, 23, 28.)
3. **"Right after this call" is still a task.** People get distracted. (Cases 02, 06.)
4. **Copy the crucial specifics from the call into the task notes**: scope, metric names,
   audience, constraints, who to send it to. (Cases 05, 13, 14, 15, 16, 22, 25, 26.)
5. **Dependencies matter**, including on things that are not tasks (free text). (Cases 02, 03, 06,
   11, 13, 21, 22, 26.)
6. **When the customer is overwhelmed, put nothing on their plate.** Create a reminder for the
   vendor owner to circle back instead (case 20: Maya revisits with Derek around 15 Jul).
7. **Check an existing task's details against the call**: owner, due date, scope. If the call says
   something different, the update should fix it. (Cases 12, 14, 26.)
