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
| 2026-10-12 | **Baseline eval run** on a throwaway local database: 30 meetings, $1.26. Results below. |
| 2026-10-12 | Judgement rules added to the AI's instructions (phrased generally, no test-set names); after run, $1.46. |
| 2026-10-12 | Rules v2 (quote rule, concreteness test for parked items); original vs v2 each run 3 times (~$8.40 total). Results below. |
| 2026-10-12/13 | Feature 1 (richer updates to existing tasks) built, reviewed in three evaluator rounds, eval run 3 times (~$4.70). Results below. |
| 2026-10-13 | Feature 2 (free-text dependencies, new `TaskDependency` table) built, reviewed in two evaluator rounds, eval run 3 times (~$4.50). Results below. |
| 2026-10-14 | Feature 3 (dependencies between new drafts from the same meeting) built; restore-orphan fix; eval run 3 times (~$4.59). Results below. |
| 2026-10-14 | Feature 4 (recorder identity) built; eval run 3 times (~$4.83). Results below. |
| _next_ | Remaining open product questions from the review, then Linear and Attio. |

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

Each run replays all 30 meetings through the real pipeline and scores the drafts against the answer key. Results are written as JSON run files in `evals/runs/` (see `evals/README.md`); the in-app `EvalRun` table and `/admin/ai` tab are deferred.

| Run | Date | Prompt / code | Match accuracy | Task recall | Task precision | Owner side | Due date | Notes captured | Quotes grounded | Gap expectations met | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Baseline | 2026-10-12 | prompt as shipped (decision pass 8,000 tokens) | 30 of 30 (100%) | 67 of 81 (83%) | 67 of 81 (83%) | 45 of 50 (90%) | 47 of 52 (90%) | 16 of 21 (76%) | 80 of 80 (100%) | 2 of 18 (11%) | $1.26 |
| After judgement rules | 2026-10-12 | prompt + Caroline's 7 rules, weekday in today's date | 30 of 30 (100%) | 67 of 81 (83%) | 67 of 77 (87%) | 46 of 51 (90%) | 50 of 52 (96%) | 20 of 24 (83%) | 73 of 75 (97%) | 1 of 18 (6%) | $1.46 |

### Baseline in detail (`runs/2026-10-12-baseline.json`)

Recall by kind of item, which maps straight onto Caroline's rules:

| Kind | Baseline |
|---|---|
| Clear commitments | 45 of 51 (88%) |
| Parked "for later" items | 0 of 5 (0%) |
| Reminders for our own team | 0 of 2 (0%) |

Also: ambiguous meetings held for a human 4 of 4, duplicate delivery absorbed 1 of 1, action type right 66 of 67, assignee right 41 of 45, status changes right 10 of 10, cited task ids all open on the board 28 of 28, new tasks duplicating the board 0 of 59.

Gap expectations by code: free-text dependency 2 of 3 (written into notes, as today's prompt asks), dependency on a new draft 0 of 11, notes on an existing task 0 of 4, dependency on an existing task 0 of 2.

**Reading it:** the AI is already reliable at the mechanics (matching, quoting, not duplicating, status changes). What it misses is exactly what the review added: it never keeps a parked item and never reminds our own team, and it proposes extra drafts (14 of 81 proposals had no match in the key). The rules in step 4 target the first two; precision is the number to watch so the rules don't make it over-eager.

### After the judgement rules (`runs/2026-10-12-after-rules.json`)

| Kind | Baseline | After rules |
|---|---|---|
| Clear commitments | 45 of 51 | 43 of 51 |
| Parked "for later" items | 0 of 5 | 1 of 5 |
| Reminders for our own team | 0 of 2 | 2 of 2 |

| Metric | Baseline | After rules |
|---|---|---|
| Precision (proposals that were right) | 67 of 81 (83%) | 67 of 77 (87%) |
| Due date right | 47 of 52 (90%) | 50 of 52 (96%) |
| Notes captured | 16 of 21 (76%) | 20 of 24 (83%) |
| Quotes found in the transcript | 80 of 80 | 73 of 75 |

Newly found: the overwhelmed-customer reminder, the "update the customer on workshop participants" reminder, a parked ad-revenue item, a forwarded guide, a PR review, and the no-action meeting correctly left empty (it had invented a task before).
Newly missed: two commitments in a security working session, a PR review in an ambiguous meeting, a staging embed page, and two existing-task updates.

**Reading it:** the rules did what they were aimed at where the behaviour is distinctive (team reminders 0 → 2 of 2, dates 90% → 96%, notes 76% → 83%, fewer invented drafts so precision rose 83% → 87%). Parked items barely moved (0 → 1 of 5): the AI still treats most "not today" items as musing, so this rule needs stronger wording or examples. Total recall is flat because a few clear commitments were missed this time. Two quotes were not found verbatim in their transcripts, the first grounding misses: the new "notes in your own words" rule may be bleeding into the source quote, which must stay verbatim.

**Caveat on noise:** each row above is one run. The model is not fully deterministic, so a swing of one or two tasks per case can be chance. The repeat runs below settle it.

### Repeat runs: averages over 3 runs each (2026-10-12)

The first "after" run raised two clear problems: quotes stitched across two speakers or taken from the meeting's written notes, and parked items still mostly dropped. **Rules v2** fixed the quote rule (one continuous passage from one speaker's turn) and reframed the parked-items rule around concreteness ("a nameable deliverable someone wants later is a task; a general wish is not"). Cue phrases in the instructions were checked against every test transcript; none overlap. Then the original instructions and v2 were each run three times.

| Metric | Original instructions (3 runs) | Rules v2 (3 runs) |
|---|---|---|
| Parked "for later" items | 0 of 5 every run (0%) | 2, 2, 3 of 5 (avg 47%) |
| Reminders for our own team | 1, 0, 0 of 2 (avg 17%) | 2, 2, 1 of 2 (avg 83%) |
| Due date right | avg 92% (90–94%) | avg 95% (93–98%) |
| Notes captured | avg 75% (71–76%) | avg 78% (75–83%) |
| Quotes found verbatim | avg 98.8% (98–100%) | avg 99.6% (99–100%) |
| Clear commitments found | avg 89% (88–90%) | avg 87% (86–88%) |
| Total recall | avg 83.5% (81–86%) | avg 84.4% (83–86%) |
| Precision | avg 81.5% (80–83%) | avg 81.7% (79–84%) |
| Owner side right | avg 91% (90–92%) | avg 86% (83–89%) |
| Gap expectations met | 2 of 18 every run | 1–2 of 18 |
| Cost per run | ~$1.28 | ~$1.50 |

**Reading it:**
- **Clear wins, well outside the run-to-run wobble:** parked items (0% → 47%) and team reminders (17% → 83%). These are the two behaviours the review said were missing.
- **Smaller real gains:** due dates (+3 points) and notes (+3 points); the ranges barely overlap.
- **No change within noise:** total recall, precision and clear commitments. The rules did not make the AI over-eager, which was the main risk.
- **One regression to look at: owner side fell about 5 points.** The new parked items and reminders are exactly the cases where "who should carry this forward" is a judgement call, so this is likely where the misses are. Worth a per-case look before shipping the rules.
- **Grounding:** the original instructions also produce the occasional non-verbatim quote (2 of 84 in one run), so the single-run dip after v1 was mostly noise; v2 is the best of the three.
- The single v1 run (above) sits within these ranges, which is why one run was never enough to judge.


**Caveat on dates:** some date conventions ("early next week" means Tuesday, "before an event" means the working day before) come from the same review as the answer key. They are the team's house rules, so following them is correct, but part of the date gain measures convention-following.



**What to watch:** recall should rise the most (parked items, "right after the call" promises, vendor reminders), notes captured should rise, and precision should not fall (the rules must not make the AI invent tasks from thinking out loud).

---

### Feature 1: richer updates to existing tasks (3 runs each, 2026-10-12/13)

Feature 1 lets the AI change several fields of an existing task in one draft and append notes to it (see `GAPS-PLAN.md` §1). It also gives the AI each open task's owner and priority, which it could not see before. Compared with rules v2 (same instructions otherwise):

| Metric | Rules v2 (3 runs) | Feature 1 (3 runs) |
|---|---|---|
| Total recall | avg 84% (83–86%) | **avg 91% (90–93%)** |
| Parked "for later" items | avg 47% | **avg 80%** (3–5 of 5) |
| Clear commitments | avg 87% | avg 91% |
| Reminders for our own team | avg 83% | avg 67% (1–2 of 2) |
| Precision | avg 82% (79–84%) | avg 79% (79–80%) |
| Owner side right | avg 86% | avg 82% |
| Due date right | avg 95% | avg 93% |
| Notes captured | avg 78% | avg 76% |
| Quotes found verbatim | avg 99.6% | avg 99.6% |
| Gap expectations met | 1–2 of 18 | **4–5 of 18** |
| ...notes on existing tasks | 0 of 4 | **1–2 of 4** |
| ...blockers that aren't tasks | 1–2 of 3 | **3 of 3** |
| Cost per run | ~$1.50 | ~$1.57 |

**Reading it:**
- **The feature closes the gap it was built for:** notes on existing tasks moved off zero for the first time, and every non-task blocker is now captured.
- **Recall jumped about 7 points**, with parked items the biggest mover. Seeing each task's current owner and priority seems to help the AI connect what was said to the board.
- **The cost of that:** it now proposes about 93 drafts per run against about 84, so precision slipped about 3 points (ranges barely overlap) and owner side another 4. Many of the extra owner misses are the recorder problem the eval surfaced (speaker "You", feature 4), which grows as the AI captures more of what the recorder promised.
- Team reminders dipped (2 cases only, so one miss is 50 points); worth watching, not yet a trend.
- One run had to be repeated: the laptop slept mid-run and six cases timed out. The interrupted run was discarded, not averaged.

### Feature 2: free-text dependencies (3 runs, 2026-10-13)

Feature 2 gives tasks a proper list of blockers: other tasks or plain text ("platform team sign-off"), several per task, text ones ticked off when they clear. The AI fills them in through `dependsOn` instead of writing "Blocked by" lines in notes. Compared with feature 1 (3 runs each):

| Metric | Feature 1 | Feature 2 |
|---|---|---|
| Total recall | avg 91% (90–93%) | avg 89% (85–90%) |
| Precision | avg 79% (79–80%) | **avg 82% (78–85%)** |
| Due date right | avg 93% | **avg 98%** |
| Notes captured | avg 76% (73–83%) | avg 68% |
| Owner side right | avg 82% | avg 81% |
| Quotes found verbatim | 99.6% | 99.2% |
| Gap expectations met | 4–5 of 18 | 3–5 of 18 |
| ...blockers that aren't tasks | 3 of 3 (via notes) | 1–3 of 3 (as real blockers) |
| ...blockers added to existing tasks | 0 of 2 | 0 of 2 |
| Cost per run | ~$1.57 | ~$1.51 |

**Reading it:**
- **The capability works:** when the AI proposes a task with a blocker, the blocker is now a real, structured dependency (for example "security sign-off on the infosec review"), not a line of text in the notes. The non-task blocker misses are runs where the task itself was not proposed.
- **Blockers on existing tasks stay at 0 of 2** because both expectations point at a *new* task from the same meeting, which is feature 3.
- **Precision and dates improved; recall dipped about 2 points** (ranges overlap, so possibly noise).
- **Notes captured fell about 8 points and needs a look.** The notes instruction only lost its "Blocked by" line, yet some details (for example the comparison tool in a parity-check task) are now missed on every run. Likely the notes simply got shorter once blockers moved out. Investigated later on a general basis, not by tuning against these meetings.
- Scoring: blocker labels are now matched on their meaningful words in any order ("Pilot completion" matches "after the pilot"); older runs rescore identically.

### Feature 3: dependencies between new drafts (3 runs, 2026-10-14)

Feature 3 lets a new task from a meeting wait on another new task from the same meeting. The AI names the blocker as `{ draftRef }`; approving the blocker later turns that into a real task dependency (and if the blocker is dismissed, the waiter keeps it as a text blocker). Compared with feature 2 (3 runs each):

| Metric | Feature 2 | Feature 3 |
|---|---|---|
| Total recall | avg 89% (85–90%) | avg 78% (77–79%) |
| Precision | avg 82% (78–85%) | avg 82% (82%) |
| Owner side right | avg 81% | avg 81% |
| Due date right | avg 98% | avg 97% |
| Notes captured | avg 68% | avg 65% |
| Quotes found verbatim | 99.2% | 100% |
| Gap expectations met | 3–5 of 18 | 4–5 of 18 |
| ...same-meeting draft blockers | 0 of 11 | **1–2 of 11** |
| ...blockers added to existing tasks | 0 of 2 | 0–1 of 2 |
| Cost per run | ~$1.51 | ~$1.53 |

**Reading it:**
- **The product path works** (unit tests cover approval order, rejection-as-text, and a snapshot-restore that used to leave a sibling pointing at a deleted task). The eval shows the model starting to emit `draftRef`, but only on 1–2 of the 11 cases that need it. Same pattern as feature 2: plumbing landed, the model still rarely uses the new field.
- **Recall dropped about 11 points**, spread across several meetings rather than one fluke (cases 02, 03, 06, 13, 26, 29 among them). Precision held because it also proposed fewer drafts. Not tuned against the golden set; worth a later look as a general "did the extra tool surface crowd out ordinary creates?" question.
- One run had six errors (laptop sleep); it was discarded and repeated. The three runs above are all 30 of 30.

### Feature 4: recorder identity (3 runs, 2026-10-14)

Feature 4 says who Miniti's speaker `"You"` is (a settings pick, stored on the Miniti integration). Their promises are drafted as theirs. If nobody is set, the draft arrives without an owner and the inbox asks for one. The eval harness sets Maya Lindqvist as the recorder instead of inventing a vendor user named You. Compared with feature 3 (3 runs each):

| Metric | Feature 3 | Feature 4 |
|---|---|---|
| Total recall | avg 78% (77–79%) | avg 82% (77–85%) |
| Precision | avg 82% | avg 78% (77–79%) |
| Owner side right | avg 81% (77–83%) | **avg 87% (86–87%)** |
| Assignee right | avg 82% | **avg 89% (89–90%)** |
| Parked "for later" items | avg 60% | **avg 80%** (4 of 5 every run) |
| Reminders for our own team | avg 83% | **2 of 2 every run** |
| Due date right | avg 97% | avg 96% |
| Notes captured | avg 65% | avg 67% |
| Quotes found verbatim | 100% | 99.6% |
| Gap expectations met | 4–5 of 18 | 3–10 of 18 |
| Cost per run | ~$1.53 | ~$1.61 |

**Reading it:**
- **The feature closes the gap it was built for on the clearest case.** Case 15's "I'll share a draft of the executive dashboard" (said by You) is owned by Maya all three runs; it used to fail owner every time.
- **Case 16 follows when the task is found** (Maya on the PR review in r1). r2 and r3 missed the review task itself, so there was nothing to assign.
- **Case 17 still attributes You's promises to the customer** all three runs (SSO guide and the workshop reminder). The model is not setting `ownerFromRecorder` there; the plumbing is not the miss. Worth a later look as a general "anonymous catchup, two speakers" problem, not by tuning against this meeting.
- Owner and assignee each rose about 6–7 points, with ranges that barely overlap feature 3. Parked items and team reminders also settled higher. Recall recovered some of the feature 3 dip (ranges overlap). Precision slipped about 4 points as it proposed more drafts again.

## Material for the case study

- The before/after table above, once both runs exist.
- The review page (screenshot or live link).
- The judgement rules table: domain expertise turned into testable rules.
- The build-vs-buy decision (in-app eval dashboard vs a hosted tool) in `EVALS_PLAN.md`.
- The story correction: an eval review that caught a product-story error, not just model errors.
