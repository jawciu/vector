# Evals Plan — Measuring Whether Vector's AI Is Actually Good

Living plan for evaluating the AI features (Miniti draft orchestrator, follow-up
drafts, Insights). Companion plan: [REALISM_PLAN.md](REALISM_PLAN.md) — its meetings
and resolution history are this plan's raw data.

**Status (2026-07-10): BUILT, NOT YET RUN.** All artifacts exist on branch `evals`
(worktree `../onboarding-evals`), uncommitted. The `EvalRun` migration is **written but
deliberately unapplied** — verified absent from the shared DB, along with
`PendingAIChange.overrides`.

Done: `EvalRun` model + hand-written migration SQL; `overrides` column + approve-route
persistence; `lib/db.js` helpers (`createEvalRun`, `listEvalRuns`,
`getDraftResolutionStats`); `evals/scoring.js` + 33 unit tests (96 tests green);
`evals/run-golden.js` (with a startup sweep for rows stranded by a cancelled CI run);
the `/admin/ai` **Evals tab**; `.github/workflows/evals.yml`; and all **30 golden
cases** (cast v2, 26 matched + 4 ambiguous, ids unique, every `sourceQuoteContains`
verified literally present in its transcript).

Remaining: **Caroline reviews the 30 golden labels** (the human-in-the-loop step that
makes the dataset ground truth), then merge → apply the migration → first `run-golden`
execution. Layer 2 (judge suite) not started.

---

## What we already have (don't rebuild this)

The plumbing for an eval harness mostly exists:

- **Human labels**: every `PendingAIChange` resolution is a ground-truth judgment —
  `status` (approved/rejected/applied), `rejectedReason`, `confidence`, `resolvedBy`,
  `resolvedAt`. Accept rate is the headline metric, and Phase 6 (auto-execute) in
  [AI_PLAN.md](AI_PLAN.md) is already gated on ~90% accept rate — so this measurement
  is on the roadmap, not extra.
- **Replay inputs**: `ExternalEvent.payload` keeps every raw Miniti payload;
  `orchestratorInput` / `orchestratorExtraction` / `orchestratorOutput` record exactly
  what Claude saw and did. `isTestRun` already hides test events from product surfaces.
- **Cost/latency**: `AICall` logs every Claude call; `/admin/ai` charts it.

## Tool decision: expand `/admin/ai` (primary), external tool optional later

**Decision (revised 2026-07-09 after Caroline pushed on build-vs-buy): build the eval
results storage + display into the app; adopt an external tracing tool only if prompt
iteration later outgrows it.** Reasons the in-app path wins *for this project*:

- **Portfolio visibility.** Reviewers can click around the deployed app and see the
  Evals tab; they can never see a private Opik/LangSmith workspace. For a portfolio
  project, the eval dashboard being *in the product* is worth more than a nicer
  private workbench.
- **The expensive parts of an observability tool already exist here.** Trace
  drill-down = the admin Pipeline timeline already renders per-event
  `orchestratorInput` / `orchestratorExtraction` / `orchestratorOutput`. Cost/latency
  = `AICall`. Human labels = the approve/reject flow. Annotation queues are for teams
  of raters; Caroline is one person whose annotation UI is the product itself.
- **The volume is tiny.** A 30-case golden set run occasionally does not need
  ClickHouse-grade infra or even a hosted free tier — a small `EvalRun` table
  (run id, timestamp, prompt/git version, per-case results JSON, headline metrics)
  plus one page covers it.
- What we give up vs a hosted tool: polished side-by-side experiment diffing and a
  prebuilt judge-metric library. A runs-over-time table with metric columns is 80% of
  the former; we write our own judge prompts anyway (we already drive the raw
  Anthropic SDK everywhere — judges are just more of the same, logged to `AICall`
  with `kind: "eval_judge"`).

**Escape hatch:** if prompt tuning gets heavy and hand-rolled comparison starts to
hurt, bolt on a hosted tool then — historical import is supported by all three
candidates, so nothing is lost by starting in-app. Research (2026-07-09 pricing pages)
for that moment, best-first for this stack: **Opik Cloud free** (25k spans/mo, 60-day
retention, no card ever, LLM-judge metrics run natively in TypeScript), then Langfuse
Hobby, then LangSmith free (14-day retention and card-for-overage make it weakest
here). Comparison table kept below for reference:

| | LangSmith free | **Opik Cloud free** | Langfuse Hobby |
|---|---|---|---|
| Volume/month | 5k traces | **25k spans** | 50k units (spans+scores count) |
| Retention | 14 days | **60 days** | 30 days |
| Seats | 1 | 10 | 2 |
| Over limit | Hard cap; PAYG needs a credit card | Cap, no card ever | Hard cap, no card ever |
| Datasets + experiments + judge evals | ✓ | ✓ | ✓ |
| Annotation UI | ✓ queues | ✓ queues | 1 queue only |
| JS/TS SDK for evals | `evaluate()` ✓ | **Best: LLM-judge metrics run natively in TS** (GEval, Hallucination…, judge via `@ai-sdk/anthropic`) | ✓, judges run server-side |
| Raw `@anthropic-ai/sdk` tracing | `wrapAnthropic` (dedicated) | manual wrap (~20 lines — we already intercept every call for `AICall`) | auto-instrumentation (dedicated) |
| Backdated/historical import | ✓ | ✓ (`trace({startTime})`) | ✓ |
| Self-host | ✗ | Apache-2.0 but heavy (ClickHouse+ZooKeeper+MinIO) — **don't** | also ClickHouse — don't |

---

## Layer 1 — Golden dataset + deterministic replay (highest value, build first)

**Dataset**: ~30 meetings in `evals/golden/*.json`, each `{ payload, expected }`.
Division of labor (agreed): **Cakes drafts both payloads and expected labels, Caroline
reviews/corrects every label** — the review is the ground truth. Bootstrap from real
stored `ExternalEvent` payloads where possible; write synthetic ones for gap coverage.

Coverage matrix (roughly):
- 10 clear-actions meetings (weekly syncs, working sessions — N expected `create_task` / `match_existing` calls)
- 5 completion reports (expected `update_status`)
- 4 match-don't-duplicate traps (action item ≈ existing open task)
- 3 ambiguous matches (no attendees / generic title → expected `matchAmbiguous`)
- 3 no-action-items meetings (expected `flag_no_action_items`)
- 3 owner-attribution tests (vendor vs customer speaker commitments)
- 2 edge cases (attendees from two customer domains; `meeting.updated` re-delivery)

`expected` per meeting: matched onboarding (by company prefix), list of expected tool
calls with the fields that matter (`action`, approximate title, owner side, taskId for
matches/status updates, dueDate when the transcript states one).

**Runner**: `evals/run-golden.js` (Node, dotenv, runs against the dev DB). For each
golden meeting: inject with `isTestRun: true` and a `sourceId` prefix like `eval-` →
real `processMinitiEvent` → score **deterministically in code**, no judge needed:

- Match accuracy (right onboarding / correctly ambiguous)
- Precision/recall on proposed tasks (pair proposed↔expected by title similarity)
- Action-type accuracy; owner-attribution accuracy; due-date accuracy
- **Groundedness for free**: every `sourceQuote` must appear in the transcript
  (normalized); every cited `taskId` must exist among that onboarding's open tasks
- Confidence distribution vs expected

Cleanup deletes `eval-`-tagged events + drafts. Output: console summary + a row in a
new **`EvalRun` table** (timestamp, git SHA / prompt version, per-case results JSON,
headline metrics) so runs are comparable over time in the admin UI. Cost: ~30 Sonnet
calls ≈ $0.40/run. **Run it whenever prompts or the match heuristic change — this is
the regression net.**

## Layer 2 — LLM-as-judge for the genuinely fuzzy parts

Our own judge prompts through the existing `lib/ai/client.js` (logged to `AICall`
with `kind: "eval_judge"`), tight 1–5 rubrics, judge forced to quote evidence;
scores land in the same `EvalRun` results:

- Draft **title clarity** and **description faithfulness to `sourceQuote`**
- Follow-up drafts: tone match, no invented facts, correct task context
- Insights: "is each `risks[]` item actually supported by the snapshot?"
- Confidence-label reasonableness (does "high" have named owner + deadline per the prompt's own rubric?)

Runs over golden-replay outputs and (sampled) recent production drafts. Plus one
**inline production check** that needs no judge and could ship in the app itself:
validate every `focusToday[].taskId` / cited ID exists in the input snapshot —
hallucination detection for free.

## Layer 3 — Production truth: `/admin/ai` Evals tab + edit-diff capture

1. **Evals tab on `/admin/ai`** (all queries over existing `PendingAIChange` data):
   - Accept rate over time (weekly), split by `action`, `source`, and **`confidence`**
     — the calibration chart: if "high" drafts don't accept visibly more than
     "medium", the model's self-assessment is noise. This is literally the Phase 6
     gate graph.
   - `rejectedReason` breakdown; pending-age; edited-before-approve rate.
   - **Eval-run history** from the `EvalRun` table: headline metrics per run over
     time, with per-case drill-down (which golden cases regressed between two runs).
2. **Ship the backlog item** (AI_PLAN "Edit-before-approve audit trail"): store the
   `overrides` diff on approve (new `PendingAIChange.overrides Json?` column).
   Edited-then-approved = "directionally right, details wrong" — the richest error
   taxonomy, currently thrown away at the moment of approval.
3. No backfill needed — all of the above queries data already in our own DB.

## Autonomous larger-scope eval (the "runs without me" part)

**GitHub Actions, not Vercel.** Corrected numbers (verified 2026-07-09): Vercel Hobby
functions cap at **60s without Fluid compute** (10s default; our webhook route sets
`maxDuration: 60`) or **300s with Fluid** — AI_PLAN's "10-second ceiling" note is
stale. Even the best case (300s) is too tight for a 30-meeting replay + judge suite
(~5–10 min of sequential Sonnet calls), Hobby cron only fires daily-or-slower, and
"run on PRs touching AI code" is inherently a CI job — Vercel can't do that at all.
Actions is free for public repos with no meaningful runtime limit:

- **Weekly scheduled run** + **triggered on PRs touching `lib/ai/**` or
  `lib/integrations/**`**: golden replay (Layer 1) + judge suite (Layer 2) → write
  `EvalRun` row → fail the check if headline metrics drop below thresholds
  (e.g. match accuracy < 95%, task recall < 80%, any groundedness violation).
- Secrets: `ANTHROPIC_API_KEY`, `DATABASE_URL`. DB options: point at
  dev Supabase (isTestRun + cleanup keeps it invisible), or a second free Supabase
  project seeded by the growth script as a dedicated eval DB — start with the former,
  move if pollution ever bites.
- Weekly cost ≈ $0.50–1.00 in Anthropic usage. Everything else $0.

## Phasing

| # | Work | Size | Depends on |
|---|---|---|---|
| 1 | Golden dataset: 30 payloads + expected labels (Cakes drafts, Caroline reviews) | **M-L** | Realism plan Steps 2–4 (companies to match against) |
| 2 | `EvalRun` table + `evals/run-golden.js` deterministic runner | M | 1 |
| 3 | Judge suite (own judge prompts via `lib/ai/client.js`) | M | 2 |
| 4 | `/admin/ai` Evals tab (accept rate + calibration + eval-run history) + `overrides` column | M | 2 for run history; rest parallel |
| 5 | GitHub Actions workflow (weekly + PR-triggered) | S | 2 (3 optional) |

Needs from Caroline: review the 30 golden labels (the one human-in-the-loop step that
makes the whole thing trustworthy) and confirm the repo is/will be public on GitHub
(for free Actions minutes). No external accounts needed anymore.
