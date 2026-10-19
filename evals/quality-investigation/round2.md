# Task and dependency decisions, second investigation

**Completed:** see [final assessment](RESULTS.md). Final run `r2-verified-full`
has 79/80 recall,79/79 correct types,79/95 precision,21/28 strict note phrases,
10/11 direct draft links (remaining expected relation is present transitively).
Known parked/field/key issues are retained. Paid calls stopped.


Caroline held the AI/dependency merge and requested further investigation and
iteration. Jev stays stopped. This continues from `dependency-quality-verified-full.json`,
not from the original broken tool boundary. The scorer is unchanged. Case 16
was subsequently revised with Caroline's explicit grouping decision, documented
below; earlier runs are preserved.
Paid model calls use disposable loopback databases; local review fixtures and
production data are untouched. No commit, push, merge, deployment or migration.

## Baseline diagnosis

1. Topical matching lets a broad existing task absorb a separately owned input.
   IP allowlisting, questionnaire delivery and document commenting then replace
   a warehouse connection, security review or finalisation task's fields.
2. Extraction omits the short forwarding commitment in case 17, and the collective
   conditional warehouse/repo commitment in case 26. Both are absent before
   persistence. Sender notes contain the recipient's forwarding work instead.
3. Case 03 carries only the write-up as a review input although a later turn also
   names the sandbox. Case 11 leaves the setup dependency empty even though the
   preceding turn says the metadata is needed. Dependency evidence spans turns.
4. The two action passes do not apply the same routine-administration exclusion:
   extraction occasionally surfaces a recap and decision pass accepts it.

## Evaluation limitations found by reading the raw outputs

The original case 16 key is archived. In case 16 the model's PR task contains the
three-model refactor and the constraint that downstream references stay untouched.
The key expects the implementation as an additional task. That is an automatic
miss, but not lost implementation scope. Do not force duplicate implementation/PR
cards just to satisfy this count. Also, the case 01 PR reviewer is explicitly
committed in the transcript but absent from the key; its extra card is counted
against automated precision. Caroline confirmed the implementation/PR grouping below. The unkeyed PR review
in case 01 remains a documented precision limitation; no other answers were changed.

## Development gates

- `r2-deliverable-five`: cases 01,02,07,17,29. Same-deliverable matching instead of
  topical matching. 17/18 actions paired, 15/17 correct types, 17/22 precision.
  IP and questionnaire become separate tasks; document review still absorbed.
  One quote-grounding failure remains. $0.3468 estimated, 10 calls. Not accepted
  as a final improvement: extra updates increased.
- `r2-parent-boundary-five`: same cases, explicit prerequisite-versus-parent test.
  17/18 paired, 15/17 correct types, 17/23 precision, $0.3044, 10 calls.
  Raw output now separates document commenting correctly as well. The questionnaire
  is also created, but fuzzy scoring pairs its expected item with an additional
  parent update instead. Parent updates still incorrectly inherit input deadlines;
  this candidate is not accepted as final.
- `r2-cross-turn-five`: cases 03,07,11,17,26. Extraction-only change on top of the
  parent-boundary prompt: capture short recipient hand-offs, collective conditional
  plans and prerequisite evidence before/after the commitment turn. In progress.
  18/18 paired, 17/18 correct types, 18/19 precision. Forwarding and warehouse/repo
  commitments recovered; SSO gets its metadata prerequisite. $0.3110, 10 calls.
  Sandbox-review input remains absent, and the workshop follow-up is still merged.
  Manual audit catches parent-date propagation and case 11's impossible calendar
  statement (a Sunday labelled Friday), neither exposed by those headline totals.
- `r2-field-guard-five`: cases 02,07,11,17,26. Decision field descriptions and
  guards preserve a parent task's dates/owner when only an input changes; routine
  administration is excluded in both passes; conditional response obligations are
  separately tracked. A code-generated calendar supplies correct weekday/date
  pairs without inferring or rewriting deadlines. 18/18 paired, 17/18 correct
  types, 18/21 precision. $0.3253, 10 calls. Not accepted: parent dates still
  propagate, and the SSO update ignores the calendar (Sunday labelled Friday).
  This demonstrates why aggregate field scores alone cannot approve the change.
- `r2-link-tool-five`: same five cases. Add a constrained dependency-only proposal
  tool that normalises into the existing update/approval path and cannot carry
  date/owner/priority fields. Tests first reproduce its missing decoder seam,
  then verify forward refs survive and extra mutation fields are refused. Make
  the existing working-week policy explicit for “this week”, and illustrate
  extraction of a two-actor conditional response with a neutral estimate example.
  18/18 paired, 16/18 correct types, 18/23 precision. $0.3831, 10 calls.
  Rejected: introduces duplicate parent updates, leaves unsupported parent dates,
  and confuses one recipient with an actor. The link-only tool is removed.
- `r2-concise-five`: same five cases. Simplify conflicting decision instructions
  into deliverable matching, actor/recipient separation, graph linking and field
  changes. Keep the successful cross-turn extraction. Relative-date hints are
  computed from exact supported timing phrases and applied only to an already
  proposed string deadline with the same sourceQuote. They cannot invent a
  deadline, reverse null removal, or resolve conditional event timing. Calendar
  arithmetic and normalisation are regression-tested at the draft boundary.
  17/18 paired, 16/17 correct types, 17/21 precision. $0.3198, 10 calls.
  Rejected as a complete fix: parent dates remain unsupported and forwarding
  disappears again. Deterministic relative-date correction itself passes its
  regression tests; the prompt simplification alone does not solve decisions.
- `r2-reasoning-five`: same five cases and same concise instructions/date code.
  Enable adaptive thinking at high effort in both existing requests, remove the
  incompatible temperature override, and permit automatic tool selection so the
  decision request can think before calling the batch tool. The decoder still
  refuses absent, multiple, malformed, no-action-mixed or truncated batches.
  Stopped after one completed case because the first extraction exhausted 8000
  thinking/output tokens without JSON and the full case took 260 seconds. One
  following in-flight extraction was interrupted, without returned usage. The
  run logger missed the first unusable response; its returned trace usage is
  included in costs.json ($0.269242 for the two returned responses). The unknown
  in-flight charge is excluded. This configuration was rejected.

Configuration reference: [Anthropic thinking compatibility](https://platform.claude.com/docs/en/build-with-claude/thinking#response-prefill-and-forced-tool-use).
Forced tool use starts with the tool call and no thinking block; automatic tool
selection is needed to allow thinking before the batch. Adaptive mode does not
guarantee thinking on every request; the run traces record whether it occurred.

Run files live in `../runs/2026-10-18-dependency-quality-<suffix>.json`.

## Budgeted candidate and explicit policy decisions

- `r2-budgeted-five` (02,07,11,17,26): thinking requested only on Pass 2,
  budget 1024, max output10000, automatic tool choice. Pass 1 remains ordinary
  JSON extraction (max 6000, temperature 0.2). 18/18 paired,17/18 correct types,
  18/21 precision, all 15 scored dates correct. Parent input dates no longer
  overwrite security/metrics deadlines; case 11's Friday resolves to26June.
  $0.438854 for10 returned responses. End-to-end case times41–82seconds.
- `r2-controls-five` (02,03,05,16,29): explicit administration classification
  removes the unwanted routine recap without dropping substantive deliveries.
  18/19 paired under the old key,18/18 correct types,4/4 draft links. Both
  sandbox and write-up feed the security review; the dbt metrics update stays
  captured. Remaining apparent recall miss is the separately keyed case 16
  implementation already present in PR notes. Optional measurements still
  incorrectly become a separate task. Strict phrase matching also rejects
  semantically equivalent July-date and reviewer wording.
- `r2-granularity-smoke` (16,17): generic two-actor extraction illustration
  captures the vendor response but decision-making still absorbs it into the
  workshop. Optional measurements still separate. Not accepted.
- Caroline confirmed: **one task covers implementation and opening its PR**;
  **a separate vendor reminder tracks the pending workshop headcount**.
  Case 16 now expects two tasks, retaining implementation scope in note checks.
  The old key is archived in `answer-key-before-round2/`. Expected actions become
  80 instead of 81. Offline rescoring of the old verified output yields78/80
  recall,74/78 correct types,78/92 precision,21/28 note checks,7/11 draft links.
  This is a policy correction, not a model improvement. Three feature2 outputs
  were also rescored offline under the same current key (no model calls).
- `r2-policy-smoke` (16,17): the vendor reminder is now separate, owned by the
  recorder, undated and waiting for the external decision. Both guide tasks and
  their link are present. 5/5 paired and correct types,5/7 precision. Case 16's
  remaining extras are the optional measurement (wrong placement) and a metrics
  dependency update (useful but unkeyed). Its proposed metrics link substituted
  review for the named implementation; the final instruction clarifies this.
  `r2-policy-smoke-current-key.json` is an offline rescore after correcting the renamed
  dependency target in the revised key; it costs nothing.
- `r2-acceptance-five` (02,07,16,17,26): final instruction precedence makes
  supporting cheap checks part of the main task even if accepted, and forbids
  substituting a review for the explicitly named implementation input.
  16/17 paired,16/16 correct types,16/18 precision, all 14 scored dates,
  owners and assignees correct. Case 16 has exactly the two intended tasks,
  optional measurements in implementation notes and its review link intact.
  Case 26 recovers all 5 expected actions and both keyed links. However case 17
  drops the customer hand-off despite extracting it; reasoning incorrectly
  treats it as unimportant internal routing. The candidate fails this gate.
- `r2-handoff-17-a`: narrow the pending-input exception so it cannot exclude an
  explicit internal document/file/email hand-off. Raw output has all 3 intended
  tasks, correct owners, dates and the guide→forward link. The scorer reports
  2/3 because “Adjust training workshop size once ops attendee count is confirmed”
  shares too few title tokens with “Update the customer on additional workshop
  participants”, even with the exact source quote. This is a pairing false
  negative, not an absent reminder. Key 17 and scorer remain unchanged.
- `r2-handoff-17-b`: all 3 intended actions and guide link present, but an
  extra customer notification and useful workshop update appear. More seriously,
  guide delivery has both vendor and customer ownership IDs; the scorer correctly
  flags its owner/assignee. This repeat fails the actor gate.
- `r2-owner-guard-smoke` (16,17): regression test first reproduces the conflicting
  assignment at the decision boundary. A narrow code guard removes the customer
  assignment only when the proposed vendor owner is the known recorder and all
  extraction facts sharing that exact quote explicitly name “You” as actor.
  Unknown recorder, mixed actors, other owners and existing-task updates are
  untouched; no owner is guessed or added. Clarify that courtesy pending-choice
  acknowledgements are conditions, while concrete artifact forwarding stays work.
  Case 16 again has exactly the intended2 tasks, and raw17 contains all 3 intended
  proposals. However the broad administration guard incorrectly deletes the
  vendor reminder because extraction mislabels it. Fixed without a further paid
  prompt trial: only a create proposal explicitly saying recap in both title
  and exact quote, unanimously labelled administration and not referenced by
  another draft, can be excluded. Regression tests first reproduce the deletion,
  then pass at the helper and actual decision-call boundary. The raw reminder
  now survives the same postprocessing path. Ownership and missing-reminder
  code regressions are fixed; no third AI call is introduced.

Only case 16's policy grouping changed. The static validator now accepts an ISO
review date instead of requiring the historic literal2026-10-11. Scoring
algorithms/thresholds are untouched. Notes denominators are conditional on
paired tasks and changed scope checks, so percentages need their counts.

The requested thinking budget is not a guaranteed observed token ceiling;
response traces retain actual usage. No third model pass was added. All four
AI-processing route entry points now allow 300seconds locally. Verify the live
Vercel target uses Fluid compute before deployment; no setting was changed and
no deployment performed. Bulk retry can still outlive the request budget and
remain retryable; a durable queue is separate work.

Validation:418 tests pass; TypeScript and static golden checks pass. Isolated
Prisma validation/generation, full ESLint and production build pass. The live review server and
its saved product fixtures are unchanged.

## Frozen confirmation

The candidate has passed the semantic gate across the small controls and actual
returned proposals, with the final code guards tested against their exact
failure patterns. The first disjoint 30-case sweep ran as 01–10,11–20,21–30.
Source hashes and model settings are pinned in manifest.json. The combiner now
requires identical extraction and decision prompts, tools and generation settings
across parts; trace evidence prevents mixing candidates. No source edits occurred during
this sweep. This is development-set verification, not a held-out accuracy claim.


### First full result: rejected, follow-up remains narrow

`r2-confirmation-full`: 30/30 no errors, $1.964457 estimated (59 responses).
74/80 paired,74/74 correct action types, all 57 scored owner sides and 52
assignees correct. All 50 keyed commitments are paired; draft links11/11,
existing-task dependency tags2/2, text dependencies3/3. However only2/5 parked
requests survive (04,11,30 omitted). Do not accept this candidate as final.
Both vendor reminders17/20 are actually present but their long titles fail
pairing;20 is undated instead of the keyed July 15 check-back. Case 29 is a
no-change existing metrics re-commitment that the model intentionally skips;
the key demands a match_existing with no changed fields. Key 29 is unchanged.
The two quote failures are a copied speaker prefix and a joined two-speaker
quote, not absent source evidence. Strict note phrases16/25 need semantic
audit before drawing a note-retention conclusion.

Next: clarify recording a specific request versus promising its immediate
delivery, keep vague future-product talk excluded, and schedule vendor checkbacks
from the stated re-engagement window without re-dating customer work. Keep
titles concise with scope/conditions in notes and dependencies. Test04,11,18,20,30
only before considering another broad check. No answer-key/scorer change.


### Parked-work repair gates

- `r2-parked-five` (04,11,18,20,30):13/13 paired and correct types,
  13/15 precision,10/10 dates, all 3 parked requests and July15 check-back
  recovered. The no-action catch-up still creates no task drafts.04's future
  customer-owned report goes to Theo, who acknowledged it, instead of Casey.
- `r2-parked-owner-three` (04,11,30): repeat with a clearer future-output
  ownership distinction and concise title requirement.11/11 paired,11/11
  precision and correct types,9/9 dates; all 3 parked requests retained.04 is
  still assigned to Theo. This is a real remaining low-priority owner error,
  not relabelled or corrected in the answer key. Priority elevation in11 is
  still not consistently inferred. Do not claim perfect assignment.
- Added a narrow verbatim-evidence guard, tested at the decision boundary and
  offline on actual first-full responses: copied speaker labels and a joined
  passage containing one unambiguous extracted commitment are reduced to that
  exact cited evidence. Ambiguous or invented passages remain visible failures.
- The source/config is now frozen for `r2-verified-*`. One final full verification
  will measure the improvement and remaining errors; stop paid calls afterwards.
  This is not an automatic merge/deployment decision.


### Final verification complete

`r2-verified-full` combines the final three disjoint parts with matching request
signatures.30/30 complete, no errors.79/80 recall,79/79 correct action types,
79/95 precision,61/62 owner side,56/57 named assignee,62/63 dates,21/28 strict
notes,93/93 grounded quotes,10/11 direct draft dependencies,2/2 existing-dependency
tags,3/3 text dependencies. The remaining direct dependency is present through
Nadia's explicitly committed IP-application task. All 50 commitments,5 parked
requests and 2 reminders are found. Case 29's no-op expectation remains unpaired.

The semantic audit and real remaining mistakes are in RESULTS.md/final-audit.json.
All 422 tests, TypeScript, lint, Prisma validate/generate, golden validation and
isolated build pass on the final source. No live review fixtures changed.
Final sweep estimate$2.042032, Round 2$8.697959; both rounds$15.486920 plus the
one unknown interrupted-request charge documented in costs.json.493 returned
responses overall, with full-part/rescore duplication excluded. Paid testing
stopped here; do not launch more without Caroline's request.
