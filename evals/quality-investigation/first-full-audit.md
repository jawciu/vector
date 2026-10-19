# Manual audit of first Round 2 full result

Run: `../runs/2026-10-18-dependency-quality-r2-confirmation-full.json`.
Scores remain untouched:74/80 recall,74/91 precision,16/25 note phrases.
This is an explanation of raw outputs, not an adjusted score.

## Missing expected rows

| Case | Automated result | Raw-output finding |
|---|---|---|
| 04 | Returns-by-reason absent | Genuine omission. Extraction excludes an accepted future request because delivery is not committed now. |
| 11 | GPU filter absent | Genuine omission. Extraction includes the parked request; decision pass omits it. |
| 17 | Vendor reminder absent | Pairing false negative. Separate vendor-owned, undated workshop adjustment is present; title wording has low token overlap. Guide and forwarding also present with correct link. |
| 20 | Vendor reminder absent | Reminder is present and correctly vendor-owned; verbose title fails pairing. Date is genuinely missing against the keyed July 15 check-back window. |
| 29 | Metrics update absent | Existing task has the same owner, scope and Not started status, with no new date. The model intentionally avoids a no-op update. Key requests match_existing with no changed field. Key unchanged. |
| 30 | Ad-revenue attribution absent | Genuine omission. An explicit agreement to note the request for the roadmap is mistaken for unowned speculation. |

## Note phrase failures on paired rows

Nine phrase checks fail. Raw output preserves their meaning in eight task notes;
the ninth is represented by a separate review task and dependency.

| Case | Strict phrase | Actual meaning retained |
|---|---|---|
| 01 | four of the six | Shortlist of six; agree which four make the pilot. |
| 05 | week of July 6 | Week of July 6th. Ordinal spelling defeats token matching. |
| 05 | post results | Results to be posted by July 2. |
| 15 | exec audience | Executive audience, leadership and executives. |
| 16 | three source-aligned | Three new staging models, one per source. |
| 16 | downstream untouched | Downstream models continue to work without changes. |
| 16 | tag me | Tag Maya Lindqvist on the PR. Recorder has been resolved by name. |
| 22 | Maya will review | Separate task for Maya to review the exec rollup, dependent on its draft. |
| 25 | review working session | Working session review follows delivery of the one-pager. |

Three historical existing-note gap checks also fail on wording/order, while
retaining:13 read-only ANALYTICS and raw-layer exclusion;14 embedded-only audience,
fct_applications/fct_interviews, snake_case, domain prefix, both named metrics;
26 read-only analytics, de-identified marts and exclusion of raw PHI.
No claim about unseen details or missing tasks follows from this paired-note audit.

## Extra proposals

Many extras are appropriate dependency updates on existing parent tasks, which
the old key does not enumerate (01,02,07,16,21,23,28,30), or separately promised
reviews (01,14,22). They still count against automated precision. Case12 marks
the drafted comms plan Done after “ready to go”; the board is In progress but
the key requests no change. This is an answer-key ambiguity, not silently fixed.
Remaining extras and their exact source evidence are retained in the run file.

## Quotation repair, separately tested offline

The two grounding failures are a copied speaker prefix (23) and a joined passage
containing two speakers (29). The new guard only reduces an actually cited
passage to an exact one-speaker quote: known prefix removal or one unambiguous
extracted commitment contained in it. It leaves invented text and ambiguous
multi-action passages unchanged. Replaying this pure guard on the recorded
responses corrects both (87/89→89/89); no AI request or database write. This
is a deterministic replay, not a new independent model score.
