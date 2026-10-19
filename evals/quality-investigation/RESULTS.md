# Final quality assessment, 18 October 2026

The main dependency regression is repaired. The final development-set run finds
all 50 keyed commitments, all 5 parked requests and both vendor reminders. Every
paired proposal has the right create/update/completion action type. No board-task
duplicates or invalid source quotes. This is a stronger candidate for integration
review, with real remaining errors listed below; it is not flawless or deployed.

## Comparable scores

All columns use the same current 80-action key and unchanged scorer. The three
pre-dependency runs were rescored offline, as was the earlier quality checkpoint.
Case 16's combined implementation/PR is Caroline's explicit policy correction,
not a model improvement. Original 81-action results and key remain archived.

| Metric | Before draft dependencies, 3 runs pooled | Earlier quality checkpoint | Final candidate |
|---|---:|---:|---:|
| Expected actions found | 213/240 (89%) | 78/80 (98%) | 79/80 (99%) |
| Correct action type / all expected | 206/240 (86%) | 74/80 (93%) | 79/80 (99%) |
| Precision, unchanged key | 213/263 (81%) | 78/92 (85%) | 79/95 (83%) |
| Owner side, paired actions | 131/160 (82%) | 55/60 (92%) | 61/62 (98%) |
| Named assignee, paired actions | 123/147 (84%) | 53/56 (95%) | 56/57 (98%) |
| Deadline, paired actions | 160/163 (98%) | 61/62 (98%) | 62/63 (98%) |
| Notes, strict phrases on paired actions | 58/82 (71%) | 21/28 (75%) | 21/28 (75%) |

Correct action type among matched rows is 79/79 (100%). Recall itself only means
an expected row could be paired; the separate type/field metrics still matter.
Final matching 30/30, ambiguous holds 4/4, repeat-delivery deduplication 1/1, expected
status changes 10/10 and grounded source quotes 93/93 all pass.

The sole missing expected row is case 29's existing dbt metrics task. Its owner,
status and scope are unchanged, with no new date; the model deliberately avoids
creating an empty approval draft. This is not missing implementation work.
The key still expects an existing-task match with no changed field. It was not
altered to inflate recall.

## Dependencies and precision

Draft dependencies score 10/11 direct links (earlier 7/11); existing-task dependency
tags 2/2 and text dependencies 3/3. In case 26 the remaining expected edge exists
**transitively**: vendor sends IPs → Nadia applies allowlist → connect warehouse/repo.
The key expects send IPs → connect and has no Nadia task. The explicit extra
customer commitment is captured; the direct-only check marks its longer chain wrong.

Raw precision is 83%, below the earlier 85%. Of 16 unkeyed proposals, 13 are directly
supported additions: nine parent dependency updates, three separately promised
reviews, and Nadia's IP-application task. Two speculative parked suggestions are
unwanted against the current policy. One completion is ambiguous against the key.
These classifications explain the raw number; no adjusted precision is substituted.
Detailed payloads/checks are in `final-audit.json` and the full run.

## Real remaining issues

| Case | Remaining issue |
|---|---|
| 04, Loop Returns | Parked returns-by-reason task goes to vendor Theo instead of customer Casey. This persisted in the narrow repeat and final run. |
| 15, anonymous exec dashboard | Inferred deadline July 7 instead of the keyed July 6. Weekly-cadence inference remains uncertain. |
| 21, Modal | Unowned row-level-security musing becomes an extra parked implementation task. |
| 22, Loop Returns | “Maybe” exploring dbt exposures becomes an extra parked task. |
| 11, Modal | Existing SSO task does not get the expected High priority; its deadline and metadata dependency are correct. |
| 12, Sylvera | Comms-plan drafting is marked Done from “ready to go”; board is In progress but key asks for no change. Requires key/product interpretation, not silently relabelled. |

Extra dependency updates were checked for hidden field changes: they keep parent
deadlines, owners, priorities and statuses unchanged. The one completion above is
listed explicitly. No extra customer work is created in the overwhelmed-customer
case 20; vendor reminder is July 15 and the old customer deadlines stay unchanged.

## Notes and the two product decisions

- Case 16 has ONE implementation/PR task, preserving three source-aligned staging
  models, thin union, downstream refs untouched, reviewer tagging and optional
  before/after compile-time measurements. Review is separate and linked.
- Case 17 has guide delivery, customer forwarding linked to delivery, and a separate
  vendor-owned workshop reminder, undated and waiting on confirmed headcount.
- Strict note phrases remain 21/28 (75%). All seven failing phrases on paired rows
  retain their meaning in notes or a separate linked review task: “four of six”,
  July 6/July 6th, post/posted results, exec/executive audience, “tag me”/Maya's name,
  Maya's separate review task, and the review working session. No semantic score
  replaces the strict result. Missing tasks are not assessed through this note audit.
- Historical existing-note gap labels also penalise wording on read-only schema
  exclusions and embedded-only metrics; inspect the final payload, not just a phrase.

## What changed

One complete proposal batch fixes the original first-tool-response omission.
Same-deliverable matching separates inputs from the work that waits for them;
short hand-offs and cross-turn dependencies stay visible. Extraction carries
execution details beyond its short snippet. Decision thinking precedes the batch;
there is no third model pass. Calendar hints repair arithmetic only on a proposed
date with matching evidence. Narrow guards preserve substantive work despite an
incorrect administration label, remove conflicting recipient ownership when the
known recorder is the explicit actor, and repair only actually cited verbatim
speaker-prefix/multi-turn quote errors. Ambiguous/invented quotes are not replaced.

## Cost, speed and validation

Final 30-case check: **$2.0420 estimated**, 59 returned responses. Median 40.3s, maximum 104.6s per meeting (earlier median 21.4s). Round 2 including rejected attempts: **$8.6980 estimated**. Both investigation rounds: $15.4869,493 returned responses. One interrupted high-thinking request has no returned usage; its unknown charge
is excluded. These are usage-based estimates, not an invoice. Part files and
zero-cost rescoring are not counted twice. Paid testing is stopped.

422 tests, TypeScript, static golden checks, full ESLint, Prisma validation/client
generation and final isolated production build pass. The live review server and
its database were untouched. Full run has 30/30 completed cases, no pipeline errors.
This is a tuned development set, not held-out production accuracy or a stability guarantee.

## Before merging

No commit, push, merge, deployment, migration or production write was performed.
The local quality/UI changes must be published if approved, integrated/tested
against current main, and the TaskDependency migration coordinated for the actual
target. The four AI-processing routes now allow 300seconds; verify live Vercel
Fluid configuration before deployment. The measured 104.6-second case would exceed
the old 60-second cap. Large sequential bulk retries still need a durable queue
for guaranteed whole-batch completion. Do not infer deployment readiness from evals.

I would take this candidate to integration review, with parked-request ownership
and speculative suggestions still a quality limitation. The raw precision/key
mismatches above must remain visible in the merge decision. Keep Jev paused.
