# Evals: golden-set replay

Replays the 30 hand-written meetings in `golden/` through Vector's real meeting pipeline and
scores the drafts against the answer key Caroline reviewed. The answer-key format is
`golden/README.md`; the story of the review is `PROGRESS.md`; the features the gap metrics are
waiting for are in `GAPS-PLAN.md`.

## Run it

```bash
npm run eval -- --mock-llm                 # whole harness, zero spend, ~5 seconds
npm run eval -- --cases 11,13 --label smoke  # real Claude calls on two cases (~$0.11)
npm run eval                               # real run, all 30 cases (~$1.60, ~15 min)
npm run eval:validate                      # static checks on the answer key (no DB, no API)
npm run eval -- --rescore evals/runs/<run>.json   # re-score a stored run: no DB, no AI, $0
```

Flags: `--cases 01,13` (subset), `--mock-llm`, `--label <text>`, `--out <file>`,
`--db-url <url>` (use an existing local Postgres; it must pass the guard), `--no-clock-shift`,
`--verbose` (print the pipeline's own logs instead of storing them in the run file).

Every run writes `evals/runs/<YYYY-MM-DD>-<label>.json` and prints a summary. Per case it stores
the **raw** pipeline output (draft rows with full payloads, Pass 2's full tool calls, Pass 1's
extraction, the match result and candidates) plus the id → board-ref and id → name maps from
seeding, then the mapped view, every check, the pipeline's logs and the cost.

**Rescoring.** `--rescore <runfile>` rebuilds every case from that raw output with the *current*
answer key and scorer, with no database and no API calls, and writes
`<runfile>-rescored-<YYYY-MM-DD>.json` next to it (or `--out`). The original is never overwritten.
It prints whether the summary and per-case scores are identical to the stored ones, so a scorer
change can be checked against an old run for free. Run files from before 2026-10-12 have no raw
output; they are rescored from their stored mapped drafts instead (the script says so). The exit code is 1 only when the harness itself failed on a case, never because a
score is low.

`--mock-llm` swaps the Anthropic client for a stub that turns each Miniti `action_items` line into
a draft. It proves the plumbing (seeding, matching, drafts, mapping, scoring); its scores mean
nothing.

## Safety model: local database only

The eval truncates every table between cases, so it must never see the live demo database.

- It starts its own throwaway Postgres (`embedded-postgres`, pinned) on `127.0.0.1` with a fresh
  temp data directory, applies `prisma/migrations` with small Supabase stubs, and deletes the
  directory on exit, including Ctrl-C.
- Before any app code is imported, `harness/guard.ts` checks the URL **as `pg` will parse it**
  (`pg-connection-string`, the parser `pg` and Prisma's adapter use), because a `?host=` query
  parameter silently overrides the host in the URL. It refuses any `host` / `hostaddr` query
  parameter outright, any parsed host that is not loopback (Unix sockets included), and anything
  matching `.env`'s `DATABASE_URL` / `DIRECT_DATABASE_URL` (or the shell's) by host, port and
  database. Only then is `DATABASE_URL` pointed at the local database.
- Once connected, the server must report a loopback `inet_server_addr()`; NULL (a socket
  connection) fails closed.
- The harness only truncates a database it set up: migrations end by creating a
  `_vector_eval_marker` table, and a `--db-url` database that has tables but no marker is refused.
- From `.env` the runner reads `ANTHROPIC_API_KEY` only. Resend, cron and webhook secrets are
  removed from the process, so no email can be sent.
- Seeding uses raw SQL, not `lib/db`, so it emits no activity, notifications or emails.

Proof: `npm run eval -- --mock-llm --db-url "<the .env DATABASE_URL>"` exits 1 with
`EVAL DB GUARD: refusing ... is not localhost`, and
`--db-url "postgresql://u:p@localhost:5432/x?host=<live host>&port=6543"` exits 1 with
`query parameter "host" would override the host`.

## How a case runs

1. **Reset and seed** (`harness/seed-case.ts`). Truncate everything, then insert the world: the 12
   cast companies with their real email domains (the matcher keys on attendee domain, and other
   customers must exist for a meeting to correctly *not* match them; case 24 needs Modal and
   Raycast both present), one onboarding per company with the default phases, the Quarry team as
   vendor users, and the case's `board` on its company's onboarding. A full reset takes tens of
   milliseconds, faster and simpler than cloning a template database, and nothing leaks between
   cases.
2. **Clock shift** (`harness/clock.ts`). "Now" is set to the end of the meeting, as it would be in
   production where a meeting is processed minutes after it ends. Without this, "by Friday" would
   resolve against October and the due-date metric would measure the harness.
3. **Deliver** the payload through the webhook route's own steps, minus HTTP: validate, match,
   record the ExternalEvent, then the same function the route's `after()` calls
   (`processMinitiEvent`, or `runMeetingExtractionOnly` for an ambiguous meeting).
4. **Ambiguous cases with `afterAssign`**: first check nothing was drafted, then do what the
   assign button does (`assignExternalEventOnboarding` + `processMinitiEvent`).
5. **`meeting.updated` (case 25)**: deliver the same meeting again; it must be deduped and create
   no drafts.
6. **Collect and score**: drafts, Pass 2's raw tool calls (`flag_no_action_items` is never saved
   as a draft, so it is read from there) and the AICall cost rows.

## What each metric means

Every metric is shown as a count and a ratio, never a bare percentage. "Paired" means the AI
proposed something the scorer matched to an expected draft.

| Metric | Plain English |
|---|---|
| Match accuracy | Did the meeting land on the right customer, or wait for a human when it should? |
| Ambiguous held for a human | For the "which customer?" meetings, nothing was drafted before someone assigned it. |
| Re-delivery deduped | Miniti sending the same meeting twice did not create anything the second time. |
| Task recall | Of the drafts a good onboarding manager would want, how many did the AI propose? |
| Recall by kind | The same, split into promises (`commitment`), parked items someone owns remembering (`parked_for_later`), and nudges for our own owner (`vendor_reminder`). These track Caroline's judgement rules separately. |
| Task precision | Of the drafts the AI proposed, how many were wanted? |
| Action type right | Paired drafts that did the right kind of thing (new task vs update vs mark done). Creating a duplicate of an existing task shows up here. |
| Owner side right | Vendor or customer, on new tasks. |
| Assignee right | The right person by name. On an existing-task update it checks who owns the task afterwards, but only when that is a real test: when the answer key's person already owns the task on the board and the draft leaves ownership alone, the check is shown in the run file and left out of the metric (it would be a free pass). |
| Due date right | Exact date. An answer key `null` means "no date" and is only right when the draft has none. |
| Priority right / Status change right | Only where someone actually set one. |
| Notes captured | The specifics from the call (`notesContains` phrases) found in the draft's description or notes. |
| Dependencies right | A new task blocked by the right existing board task. |
| Quotes found in transcript | Every draft's source quote appears in the transcript (groundedness). Quotes taken from Miniti's action-items list instead are counted in the run file. |
| Cited ids = open tasks | Every task id the AI cited (including ones the pipeline then dropped) is an open task on the board. A Done task does not count: the AI is only shown open tasks. |
| New tasks duplicating board | New-task drafts that restate an open board task. Lower is better. |
| Gap expectations met | Things Caroline asked for that the AI's tools cannot express yet (`gap` codes in the answer key), kept out of every number above and reported here, by code. They should rise as `GAPS-PLAN.md` ships. |

Field accuracies are scored only on paired drafts ("when it found the task, did it get the date
right?"). Missing the task entirely is recall's job; counting it again in every field would
penalise one miss many times. When a match is wrong, the case's drafts are still scored, so recall
reflects the miss.

### Fuzzy matching, and the thresholds

- **Words** are compared lowercased, without punctuation or accents, with number words zero to
  twenty read as digits ("four" = "4"), and lightly stemmed (plurals, -ed, -ing), so
  "dashboards" = "dashboard" and "tagged" = "tag".
- **Pairing drafts to expectations** (`scoring.ts`). Updates to an existing task pair by board
  ref first. New tasks pair by title: word overlap (Dice coefficient) after dropping stopwords,
  at least **0.35**, or at least **0.15** when the draft's quote also contains the expected
  quote, against the best of `titleLike` and any `titleAlternatives`. Among the candidate pairs
  the scorer picks the **optimal assignment** (most pairs, then highest total score, where a
  matching quote adds 0.5), so two similar expected titles in one case cannot steal each other's
  drafts by list order. An update draft uses its target task's title, so "updated an old task when
  a new one was expected" pairs and counts as an action error rather than vanishing.
  Calibration (2026-10-12): across the answer key, 9 of 318 pairs of *different* tasks (sibling
  expectations, or an expectation against an open board task) reach 0.35; the sibling ones are
  exactly what optimal assignment resolves.
- **Notes phrases**. First tried as an exact phrase. Failing that, the phrase's content words
  must appear **in order, each within 3 tokens of the previous one** ("not the raw PHI" matches
  "not raw PHI data"; "no raw layer" does not match "the layer is raw, there is no time"). "no"
  and "not" are content words. The validator rejects single-word phrases, which match almost
  anything; code identifiers like `fct_applications` are fine.
- **Duplicates**: a new-task title with word overlap of 0.6 or more against an open board task.
- **Gap expectations** are met only by a draft of the expected action (a duplicate `create_task`
  paired with an existing-task expectation earns nothing), and only through structured fields
  (`appendNotes` since feature 1, `dependsOn` since feature 2, `draftRef` with feature 3). Notes
  on an existing task count only as `appendNotes`, never the draft's own notes field.
  `free_text_dependency` is met by a `{ text }` dependency matching the expected phrase (notes
  phrase rules); `existing_task_dependency` by an update whose `dependsOn` names the expected
  board task. One exception kept for older run files: a "Blocked by: ..." line in a new task's
  notes still counts, because that is what the prompt asked for before feature 2 (so every
  stored run rescores identically).

These live as named constants in `scoring.ts` (`PAIR_THRESHOLD`, `QUOTE_ASSISTED_THRESHOLD`,
`NOTES_WINDOW`, `DUPLICATE_THRESHOLD`) and are covered by `scoring.test.ts`. After changing any of
them, rescore the latest real run to see the effect for free.

## Cost

Each matched meeting is two Sonnet 4.6 calls, about $0.05. An ambiguous meeting runs Pass 1 on
arrival and only Pass 2 after assignment. A full run is about **$1.60**; the 2-case smoke run on
2026-10-11 cost $0.106. The run file records the exact cost per case from the local AICall rows.

## What the harness cannot express yet

- An existing-task update cannot name a new owner (the tool's `reassign` has no target), so an
  `assignee` on `match_existing` is checked against the board owner, and a `reassign` draft fails
  it.
- The board has no phases, so tasks are placed in a default phase by title keywords. Phases are
  not scored.
- The anonymous recorder "You" is seeded as a vendor user literally named "You", so the answer
  key's `assignee: "You"` can be scored.
- Runs are sequential (~30 s per case). Parallel cases would need one database per worker.

## CI

`.github/workflows/evals.yml` runs on **manual trigger only** (inputs: cases, label, mock). It
needs the `ANTHROPIC_API_KEY` secret and no database secret: Postgres runs inside the job. The
run file is uploaded as an artifact. Weekly or PR-triggered runs, and failing on thresholds, are
Caroline's call once there is a baseline.
