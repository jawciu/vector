# Jev / Claude: offline decision comparison

Protocol: decision-comparison-v1. Source: evals/runs/2026-10-14-feature4-r1.json.

Exploratory sample selected for known errors and varied behaviour. These are reused development cases, not an independent test set. No production database or application routes are used.

Both models receive the exact same saved extraction, transcript, board, people, recorder and Choice questions. Expected answers and historical model decisions are never sent. Claude answers this narrower decision contract; it is not a fresh run of the current production orchestrator.

Drafts below are deterministic projections of selected candidates, not Claude-written final drafts. Dates, notes, priority, customer matching and execution are not measured.

## Candidate availability (heuristic, needs human checking)

| Case | Expected items with a candidate | Possibly absent upstream |
|---|---|---|
| 01 | 4/4 |  |
| 02 | 4/4 |  |
| 03 | 3/4 | Get security approval |
| 13 | 2/2 |  |
| 15 | 2/2 |  |
| 17 | 2/3 | Forward the SSO troubleshooting guide to IT |
| 20 | 1/1 |  |
| 26 | 5/5 |  |

## Results

Correct action / owner count missing items as failures. Dependency recall includes gap-tagged expectations. All scores use heuristic title/quote pairing and need a human spot-check. Conditional owner accuracy alone can hide missing tasks.

| Case | Model | Items found | Wanted / proposed | Correct action | Correct person | Expected dependencies found | Correct / proposed links | Review flags |
|---|---|---|---|---|---|---|---|---|
| 01 | claude | 3/4 | 3/4 | 2/4 | 3/4 | 0/1 | 0/1 | 0 |
| 01 | jev | pending | | | | | |
| 02 | claude | 4/4 | 4/5 | 4/4 | 4/4 | 2/2 | 2/3 | 0 |
| 02 | jev | pending | | | | | |
| 03 | claude | 3/4 | 3/3 | 3/4 | 3/4 | 0/2 | 0/0 | 0 |
| 03 | jev | pending | | | | | |
| 13 | claude | pending | | | | | |
| 13 | jev | pending | | | | | |
| 15 | claude | pending | | | | | |
| 15 | jev | pending | | | | | |
| 17 | claude | pending | | | | | |
| 17 | jev | pending | | | | | |
| 20 | claude | pending | | | | | |
| 20 | jev | pending | | | | | |
| 26 | claude | pending | | | | | |
| 26 | jev | pending | | | | | |

## Review the actual decisions

Uncertainty is reported; there is no automatic confidence gate or automatic task execution. Jev probabilities are saved; Claude does not supply comparable probabilities.

### 01: Modal x Quarry — weekly implementation sync

| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |
|---|---|---|---|
| a1: Draft incremental model config for usage events table and open PR by Thursday June 18 | I'll draft the incremental model config for the usage events table and have it in a PR by Thursday the 18th. | create_task / none / Theo Okonkwo | pending |
| a2: Review incremental model config PR on the same day it is opened | Perfect, I'll review it same day. | create_task / none / Jonas Beck | pending |
| a3: Add Quarry static IPs to warehouse network policy by end of day Wednesday June 17 | I'll add the Quarry static IPs to our warehouse network policy — I can get that done by end of day Wednesday, June 17th. | match_existing / t1 / Jonas Beck | pending |
| a4: Circulate pilot dashboard list to analytics guild and get sign-off by Friday June 19 | I'll circulate the pilot dashboard list to the analytics guild and get sign-off by Friday the 19th. | create_task / none / Priya Raman | pending |
| a5: Address row-level security for the sales team after the pilot | at some point we should think about row-level security for the sales team, but that's not a today problem. | ignore / none / unknown | pending |

**claude dependencies:** a1: []; a2: [{"draftRef":"a1"}]; t1: []; a4: []

**claude review flags:** none

### 02: Function Health security review — working session

| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |
|---|---|---|---|
| a1: Send completed SIG Lite questionnaire to Freya by June 5th | I'll send the completed SIG Lite questionnaire back to Freya by June 5th. | create_task / none / Ines Ferreira | pending |
| a2: Upload pen test summary to the portal by Monday June 8th | I'll get the pen test summary uploaded to your portal by Monday, June 8th, once Sam shares it. | create_task / none / Freya Dunn | pending |
| a3: Email pen test report to Freya right after this call | I'll email it to you right after this call, it's ready to go. | create_task / none / Sam Whitfield | pending |
| a4: Provision read-only Snowflake service account scoped to ANALYTICS schema with key-pair auth by June 10th | I'll provision the read-only Snowflake service account as soon as security signs off — targeting Wednesday, June 10th. | create_task / none / Oliver Hartley | pending |
| a5: Recap agreed dates and chain in the portal after the call | I'll recap in the portal after this. | create_task / none / Ines Ferreira | pending |

**claude dependencies:** a1: []; a2: [{"draftRef":"a3"}]; a3: []; a4: [{"taskRef":"t1"},{"text":"Warehouse team will not create the service account until security signs off due to PHI in the schema"}]; a5: []

**claude review flags:** none

### 03: Ashby embedded analytics — weekly sync

| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |
|---|---|---|---|
| a1: Set up embed sandbox with signed JWT auth and share credentials by June 24 | I'll set up the embed sandbox with signed JWT auth and share credentials by Wednesday, June 24th. | create_task / none / Theo Okonkwo | pending |
| a2: Expose customer_id claim in session token deployed to staging by June 26 | I'll expose the customer_id claim in our session token — deployed to staging by Friday, June 26th. | create_task / none / Ruben De Smet | pending |
| a3: Write up row-level filtering approach for multi-tenant embeds and send it over by June 25 | I'll write up the row-level filtering approach for multi-tenant embeds and send it over by Thursday the 25th. | create_task / none / Maya Lindqvist | pending |
| a4: Reconvene next Monday | So: sandbox Wednesday, write-up Thursday, staging claim Friday. Reconvene next Monday? | ignore / none / unknown | pending |
| a5: Load-test the embeds at a later stage | It might be worth load-testing the embeds eventually, but let's see it working first. | ignore / none / unknown | pending |

**claude dependencies:** a1: []; a2: []; a3: []

**claude review flags:** none

### 13: Function Health implementation catch-up

| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |
|---|---|---|---|
| a1: Close out the security review early next week | The remaining answers are drafted internally and I'm waiting on one approval from our platform lead. I expect to close the review out early next week. | pending | pending |
| a2: Provision the Snowflake service account (read-only on ANALYTICS schema) the same day security signs off | The moment Nadia signs off, I'll provision the Snowflake service account — read-only on the ANALYTICS schema, exactly as specced. It's a same-day job once the review closes, so I won't put a separate date on it. | pending | pending |
| a3: Connect the dbt repo the same day the service account is provisioned | Once the service account exists we can connect the dbt repo the same day, so the chain unblocks quickly. | pending | pending |
| a4: Ping Sam on Slack if provisioning throws anything unexpected | If provisioning throws anything weird I'll ping you on Slack. | pending | pending |
| a5: Speak once the service account is live | Let's speak once the account is live. Thanks both. | pending | pending |
| c1: Function Health's security questionnaire responses (including HIPAA and data-handling sections) are complete on the vendor side | No, your responses were complete, including the HIPAA and data-handling sections. | pending | pending |
| c2: The tool itself was approved; only the data-sharing terms for health data caused delay | From my side, no further reviews needed after this one. The tool itself was approved — it was the data-sharing terms for the health data that took time. | pending | pending |

### 15: Weekly sync

| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |
|---|---|---|---|
| a1: Finish tagging the exposure models by Thursday | I'll finish tagging the exposure models by Thursday. | pending | pending |
| a2: Share a draft of the executive dashboard before the next call | I'll share a draft of the executive dashboard before our next call so you have something concrete to circulate. | pending | pending |
| c1: Warehouse connection is healthy after credential rotation; overnight syncs all green | Connection's been solid since the credential rotation. The overnight syncs have all gone green. | pending | pending |

### 17: Quick catch-up

| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |
|---|---|---|---|
| a1: Send SSO troubleshooting guide today | I'll send you our SSO troubleshooting guide today — page two shows exactly where the assignment lives. | pending | pending |
| a2: Let You know once ops team decides on extra training attendees so workshop can be sized accordingly | Let me know once they decide and we'll size the workshop accordingly. | pending | pending |
| a3: Size the training workshop once attendee count is confirmed | That's fine capacity-wise. Let me know once they decide and we'll size the workshop accordingly. | pending | pending |

### 20: Flock Freight status call

| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |
|---|---|---|---|
| a1: Keep vendor side warm so nothing stalls while Flock Freight is in crunch | I'll keep our side warm so nothing rots in the meantime. | pending | pending |
| a2: Draft permission grants for warehouse permissions so Derek's team only needs to review | we could draft the permission grants so it's a review rather than a build | pending | pending |
| a3: Check back in with Derek about warehouse permissions restart after quarter-end | Maybe after quarter-end? I'd need to check with our platform person and she's buried too. | pending | pending |
| a4: Revisit pilot group question with Derek after reporting season | We should probably revisit that once reporting season is over. I just can't put a date on it right now. | pending | pending |

### 26: Function Health weekly sync

| Candidate | Evidence | Claude action / task / owner | Jev action / task / owner |
|---|---|---|---|
| a1: Send the Quarry static IP list to Function Health by tomorrow | I'll send over the Quarry static IP list by tomorrow so your team can add it to the network policy. | pending | pending |
| a2: Create the Snowflake service account by Friday | And I'll get the Snowflake service account created by Friday. Platform team has capacity this week. | pending | pending |
| a3: Connect the warehouse and the repo once the IP list and service account are in place | Once both land, we connect the warehouse and the repo the same day. | pending | pending |
| a4: Scope access reviews ahead of HIPAA audit season once the warehouse is connected | Noted, let's scope that once we're connected rather than now. | pending | pending |
| c1: Infosec questionnaire review is complete | We signed off the infosec questionnaire yesterday afternoon. That review is done from our side. | pending | pending |
