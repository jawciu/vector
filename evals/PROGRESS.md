# Evals progress log

A running record of how Vector's meeting AI is evaluated and improved: what was reviewed, which rules came out of the review, and what each eval run measured before and after a change. Written to be lifted into a portfolio case study.

**The AI being evaluated:** when a customer meeting transcript arrives (from Miniti), Vector matches it to a customer onboarding and proposes drafts: create a task, update an existing task, mark one done, or flag that there is nothing to do. A person approves or rejects every draft.

**The question the eval answers:** if a good onboarding manager sat in that meeting, would they end up with the same task list the AI proposed?

---

## Timeline

| Date | What happened |
|---|---|
| 2026-07-09 | Eval plan written (`EVALS_PLAN.md`): golden dataset + deterministic replay, in-app results, GitHub Actions runs. Build-vs-buy decided in favour of in-app (reviewers can see it). |
| 2026-07-09/10 | 30 golden meetings drafted with expected answers, plus the scoring code, runner, `EvalRun` table and admin Evals tab. Not yet run. |
| 2026-10-11 | Golden set had gone stale against the live demo board (10 of 30 cases pointed at tasks that were missing or already done). Decided each case should carry its own board. |
| 2026-10-11 | **Caroline reviewed all 30 cases** in a purpose-built review page. Outcome below. |
| 2026-10-11 | Answer key rewritten from the review: new story (Quarry Analytics), new expected fields, capability gaps marked, judgement rules written down. |
| _next_ | Baseline eval run with the current prompt. |
| _next_ | Prompt updated with the judgement rules; after run. |
| _next_ | Features for the capability gaps (see `GAPS-PLAN.md`), each measured by the eval. |

---

## The review (2026-10-11)

**Tool:** a review page showing each meeting's transcript beside the AI's expected actions in plain English, with Looks right / Needs a change / Not sure and a notes box per case. Link (private, pinned): https://claude.ai/artifact/GiHw8914Y3VP1SXjN33dWq. Page source: `evals/review-2026-10-11/`. The raw review notes and the per-case change list are kept locally, not in git.

**Result:** 30 of 30 reviewed.

| Verdict | Cases |
|---|---|
| Looks right | 11 (07, 08, 09, 10, 15, 16, 17, 18, 19, 24, 29) |
| Needs a change | 18 (01, 02, 03, 04, 05, 06, 11, 12, 13, 14, 20, 21, 22, 23, 26, 27, 28, 30) |
| Not sure | 1 (25: the duplicate-delivery edge case; explained and kept) |

Even three of the approved cases (15, 16, 17, the "which customer is this?" meetings) came with notes about which tasks should appear once someone assigns the meeting to a customer.

**What the review found, in short:** the answer key I had written only captured commitments stated in the form "I will do X by date Y". Caroline's notes describe how an experienced onboarding manager actually listens. That gap is the most valuable output of the whole exercise.

### Judgement rules that came out of the review

These become instructions for the AI. Each is tested by the cases listed.

| Rule | What it means | Cases |
|---|---|---|
| Parked items become undated tasks, when someone owns remembering them | "Not today" items that someone has taken on (or said they'll note) still land on the board, without a date. Pure thinking out loud stays out. | 01, 04, 26, 27, 30 |
| Infer dates from vague or anchored phrases | "Early next week" or "before the training session" becomes a real date, worked out from the meeting date. | 06, 13, 16, 17, 23, 28 |
| A promise to do it "right after this call" is still a task | People get distracted after calls; the promise is tracked like any other. | 02 |
| Copy the crucial specifics from the call into the task notes | Scopes, metric names, audiences and constraints agreed on the call go into the task, so nobody has to re-listen. | 05, 13, 14, 15, 16, 22, 25, 26 |
| Dependencies matter, including on things that aren't tasks | A task can be blocked by another task or by something outside the board, such as a sign-off. | 02, 03, 06, 11, 13, 21, 22, 26 |
| When the customer is overwhelmed, remind our own owner to circle back | Nothing goes on the stretched customer's plate; our owner gets a dated reminder instead. | 20 |
| Cross-check existing tasks against what was said | When a call touches an existing task, its owner, due date and scope are checked against what was agreed. | 12, 14, 26 |

### Corrections to the story itself

The test meetings were written as if Vector were the analytics product customers build in. Caroline caught it (cases 12 and 22): Vector is the onboarding tool. The analytics product now belongs to a fictional vendor, **Quarry Analytics**, whose team uses Vector to onboard its customers. The transcripts were rewritten. The live demo data still needs the same rename (a separate, dry-run-first change).

Case 13 also had a contradiction in its transcript (a service account promised before the security review that gates it); fixed.

### Capability gaps (things she asked for that the AI cannot do yet)

These are written into the answer key but marked, and scored as a separate metric so the headline numbers stay fair. The build plan is in `GAPS-PLAN.md`.

| Gap | Example |
|---|---|
| Free-text dependency | "blocked by platform team sign-off" (not a task anyone can tag) |
| Dependency on a new task from the same meeting | "Migrate the dashboards" depends on "Add metrics block", both proposed in one meeting |
| Notes or a dependency added to an existing task | add "read-only, ANALYTICS schema only" to the existing service-account task |
| Several changes to one existing task at once | new due date + new priority in one update |

### Answer key changes

- Every case except 24 now carries its own board (138 tasks across 29 cases). Case 24 stays unassigned by design.
- Expected new tasks went from 42 to 55, plus 8 that should appear once someone assigns the three "which customer?" meetings.
- 20 expectations are marked as capability gaps: 11 dependencies on another new task from the same meeting, 4 notes on an existing task, 3 free-text dependencies, 2 dependencies added to an existing task.
- 8 interpretations were flagged for Caroline to confirm.
- Validation: every expected quote appears verbatim in its transcript, every task reference resolves on its board, and no expected new task duplicates an open board task (`evals/validate-golden.mjs`).

---

## Eval runs

Each run replays all 30 meetings through the real pipeline and scores the drafts against the answer key. Results are stored in the `EvalRun` table and shown on `/admin/ai`.

| Run | Date | Prompt / code | Match accuracy | Task recall | Task precision | Owner accuracy | Date accuracy | Notes captured | Groundedness violations | Gap expectations met | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Baseline | _pending_ | current prompt | | | | | | | | | |
| After judgement rules | _pending_ | prompt + rules | | | | | | | | | |

**What to watch:** recall should rise the most (parked items, "right after the call" promises, vendor reminders), notes captured should rise, and precision should not fall (the rules must not make the AI invent tasks from thinking out loud).

---

## Material for the case study

- The before/after table above, once both runs exist.
- The review page (screenshot or live link).
- The judgement rules table: domain expertise turned into testable rules.
- The build-vs-buy decision (in-app eval dashboard vs a hosted tool) in `EVALS_PLAN.md`.
- The story correction: an eval review that caught a product-story error, not just model errors.
