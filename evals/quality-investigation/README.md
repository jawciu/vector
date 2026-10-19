# Dependency regression investigation — 2026-10-18

**Current result:** [Final Round 2 assessment](RESULTS.md), with raw scores,
manual audit, costs and remaining issues. Paid testing is stopped. The
[iteration ledger](round2.md) preserves rejected candidates. This page retains
the historical first-round result below; its81-action key was later revised
with Caroline's explicit implementation/PR decision.

## Round 1 outcome

Final full sweep: `../runs/2026-10-18-dependency-quality-verified-full.json`.
All 30 cases completed without pipeline errors. Paid work stopped at this
checkpoint, then resumed when Caroline asked for more assessment (Round 2).

| Metric | Latest pre-fix feature 4 (three runs, Oct 14) | Final version (one 30-case sweep, Oct 18) |
|---|---:|---:|
| Task recall | avg 82% (77–85%) | 78/81 (96%) |
| Task precision | avg 78% (77–79%) | 78/92 (85%) |
| Owner side | avg 87% | 55/60 (92%) |
| Named assignee | avg 89% | 53/56 (95%) |
| Due date | avg 96% | 61/62 (98%) |
| Notes, strict phrases on matched tasks | avg 67% | 18/24 (75%) |
| Same-meeting draft dependencies | 2–6/11 per run | 7/11 |
| Parked work | 4/5 each run | 5/5 |
| Vendor reminders | 2/2 each run | 2/2 |
| Grounded quotes | avg 99.6% | 90/90 (100%) |

For the original regression comparison, feature 2 before draft links averaged
89% recall and 82% precision; feature 3 dropped to 78% recall. The final sweep
exceeds both those headline measures. Notes return close to the older feature-1
phrase score (~76%), with the limitations below. Field scores are conditional
on matched drafts and must not be read as accuracy across every expected item.
Recall itself is finding a paired draft, not proof of the correct action type:
74/78 paired actions have the correct type (74/81 expected items overall).

The dbt metrics update is recovered. The batch boundary problem is repaired;
quality is materially better on this regression set, but imperfect.

### Remaining errors

- Three missed expected actions: case 16's separate staging-model implementation,
  case 17's guide-forwarding task, case 26's warehouse/repo connection.
- Four create-versus-update mismatches: cases 01 (IP allowlist), 02 (questionnaire),
  07 (document review), 17 (workshop-participant update). Broad existing tasks can
  still absorb distinct deliverables. Do not hide these behind the recall score.
- Four missing draft links: case 03's review → sandbox; case 11's SSO → metadata;
  case 17's forwarding → guide; case 26's connection → IP list. The last two
  accompany missing tasks. Existing-task dependency checks pass 1/2.
- Existing-task note scope is still undercounted by strict phrase matching (1/4
  automatically), while raw notes retain the reviewed facts. See the explicit
  semantic audit below. Reviewer-tagging/measurement details in case 16 still
  merit follow-up; the scored note metric is not a complete semantic judge.
- Priority is correct on 1/2 applicable expectations. Human draft approval remains
  required. The per-meeting Miniti recorder mapping is still a separate dependency
  on Ian's payload contract, not changed by this fix.

Estimated cost is **$6.788961 total** for all development attempts and three full
checks, **$1.468553** for the final sweep (59 calls). `costs.json` counts full
aggregates once and excludes their duplicate part files. These are token-rate
estimates, not an independently reconciled invoice. No Jev calls were resumed.
Code is local and uncommitted. No merge, deployment or production migration.

## Scope and controls

Investigate missed task drafts and lost note details after same-meeting draft
links were added. Caroline authorized development on roughly five failing
meetings at a time, and full 30-meeting checks only after a small candidate worked.
All runs use disposable loopback Postgres, real Sonnet 4.6, temperature 0.2,
and the production pipeline. No Jev, production writes, emails or deployment.
The answer key and scorer are unchanged. Every successful call is retained.

Development began with cases 02, 06, 13, 26, 29; case 05 was added for the repeated
notes miss. Subsequent five-case gates added controls and parked/review boundaries.
This is a development and regression exercise on a reused golden set. The broader 30-case sweep is regression evidence, not an unseen test set
or a production accuracy estimate. See `manifest.json` for the final source hash.

## Finding

The old Pass 2 requested separate tools once and consumed only that response.
There was no subsequent tool-result conversation. The captured text in the
wording-only run explicitly plans missing downstream tasks and existing-task
updates, including case 29's dbt metrics update, but omits them from the actual
tool calls. Responses stop with `tool_use`, well below the token limit. The
missing proposals are already absent before database validation/persistence.
The fresh baseline reproduces the omission. A wording-only instruction to emit
a complete batch does not repair it. Forcing one batch does.

This strongly supports a tool-response boundary problem, rather than blaming
all the loss on extraction or task/dependency wording. Some extraction misses
remain possible; prior case 26 traces omit the warehouse/repo commitment too.

## Change

- Pass 2 calls `propose_meeting_drafts` once with a complete array of the existing
  per-draft tool shapes. Forward draft references work without tool results.
- Vector decodes the array into the existing draft-call format, then uses the
  existing ID checks, dependency planning and persistence path. No extra model
  pass or approval behavior change.
- The prompt distinguishes drafting blocked work from executing it. It requires
  accounting for the extracted commitments in the complete batch.
- Notes preserve execution details, comparison/reference systems, constraints
  and delivery instructions, with no arbitrary one/two-sentence limit. Moving a
  blocker into `dependsOn` must not remove the rest of the task's instructions.
- Missing, malformed, empty, mixed no-action, and token-limited batches fail
  visibly. Paid response usage is logged before decoding can fail.
- Eval files now preserve exact synthetic request bodies/full responses and
  checkpoint each completed case. SDK options/headers are not recorded. New
  live runs refuse an existing output path instead of overwriting paid results.

## Development results

| Run suffix | Cases | Expected actions found | Correct / proposed drafts | Expected draft links | Estimated cost |
|---|---|---:|---:|---:|---:|
| baseline-five | 02,06,13,26,29 | 11/20 | 11/14 | 0/4 | $0.3402 |
| batch-five (wording only) | same | 10/20 | 10/12 | 0/4 | $0.2880 |
| single-batch-five | same | 20/20 | 20/25 | 4/4 | $0.3010 |
| notes-five | 05,06,13,26,29 | 20/20 | 20/26 | 3/3 | $0.3119 |
| final-five (rejected broad matching rewrite) | 02,05,13,26,29 | 19/19 | 19/27 | 3/3 | $0.3155 |
| date-guard-smoke (rejected) | 02 | 4/4 | 4/6 | 1/1 | $0.0721 |

Files are `../runs/2026-10-18-dependency-quality-<suffix>.json`. Fresh baseline
source matches `90bde62:lib/ai/orchestrator.ts` exactly. The wording and subsequent
runs retain exact requests in `llmTrace`. The broad matching rewrite produced
more extras and poorer note-phrase scores, so it and the ineffective date-field
wording were discarded. The complete batch plus notes clarification was the first promising version,
tested in `notes-five`; the broader checks below then motivated further fixes.

Case 05's note now names the old Looker explore and says results must be posted.
The scorer still flags the phrase "post results" because its ordered phrase
matcher does not equate that with "results must be posted". Similarly, case 13
can contain "no access to the raw layer" while failing the phrase "no raw layer".
These are documented scoring limitations; no thresholds or answers were changed
to improve the reported numbers. Some extras are genuine extra commitments not
in the key, while others (for example a review deadline inferred from its inputs)
are real model errors. Neither category should be hidden by recall alone.

## Broader checks and follow-up

The first 30-case check (`dependency-quality-confirmation-full.json`) recovered
75/81 actions (93%) but precision was 75/110 (68%) and strict note phrases were
14/22 (64%). This was not accepted as the final fix. The snapshot is preserved.

The next change added explicit extraction.details, narrowed unowned speculative
future ideas and routine meeting administration, and allowed unchanged-task
restatements to produce no update. A five-case gate (01,05,09,13,29) found 16/16
expected actions at 16/19 precision (84%), retaining the existing-task updates
and completion/control cases. Cost $0.2918.

Its full check (`dependency-quality-finalcheck-full.json`) found 76/81 actions
(94%), precision 76/95 (80%), 8/11 draft links, 2/2 existing-task dependencies,
3/3 text dependencies, 100% grounded quotes and 100% cited IDs. Strict note
phrases were 17/24 (71%). Cost $1.4703. It also exposed two omitted parked requests.

The next boundary clarification preserves a specific requested deliverable that
someone explicitly notes for later, even without a promise to deliver it now.
This differs from speculative future product talk. It also distinguishes an
own-team artifact-review request from an unowned external blocker. The boundary
five (03,04,05,11,29) found 18/19 actions at 18/21 precision (86%), recovering both
parked requests while retaining the speculative-idea controls. The remaining
owned-review request then passed a one-case smoke: 4/4 recall, 4/4 precision.
The last full sweep uses `dependency-quality-verified-*`; its results are at the
top of this report. Prompts remained frozen during each sweep, and paid calls
stopped after the verified sweep.

All full sweeps run in three separate ten-case local databases to reduce wall
time without adding model calls. `combine.ts` rejects incomplete, mock, mixed
prompt/tool, duplicate or missing-case parts and combines scores without a model
call. Old attempts are not overwritten or mixed into the final score.


## Verification

400 unit tests pass, including batch forward references, preserved update notes,
malformed/mixed batches, token exhaustion, and eval trace forwarding/reset/error
behavior. Static golden validation, TypeScript, targeted/full lint (existing
warnings only), Prisma validation/generation and an isolated production build
pass. The local review server/database were not restarted or reseeded.

## Notes audit: why the strict phrase score understates captured scope

The second full sweep's existing-task-notes metric reported only 1/4 even though
all four updates contained the agreed scope. This audit does not replace or
change the automated score:

| Case | Key phrase missed | Actual note content |
|---|---|---|
| 12 | six dashboards | "14 of 20 dashboards. Six remain: the carbon ratings pack and the two revenue dashboards" |
| 13 | no raw layer | "read-only on the ANALYTICS schema only, no access to the raw layer" |
| 14 | embedded first | "Target audience is embedded customer dashboards, not internal reporting", plus both source tables, snake_case/domain prefix and metric names |
| 26 | all phrases passed | Read-only analytics schema, de-identified marts and exclusion of raw PHI retained |

Other strict false negatives include "week of July 6th" versus "week of July 6",
"results must be posted" versus "post results", and a six-dashboard shortlist
from which four are selected versus "four of the six". Other omissions are real:
a refactor note may omit reviewer-tagging or measurement details. Keep the two
categories distinct; do not improve scores by adding golden-key phrases to the
prompt. No scorer or answer-key change was made during this investigation.
