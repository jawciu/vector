# Offline Jev / Claude decision experiment

Question: does Jev make better action, ownership and dependency decisions than Claude
on the **same extracted candidates**, before Claude writes a draft?

This is an experiment beside the eval harness, not an application integration.
It imports no app/database client, does not send webhooks, and makes no production writes.
No commits, deploys or PRs are needed to run it.

## Run

```bash
npm run eval:decisions -- --prepare
npm run eval:decisions -- --env /Users/caro/Code/onboarding/.env
```

The env file needs `ANTHROPIC_API_KEY` and either `AI_GATEWAY_API_KEY` (preferred,
Vercel billing) or `TYPESAFE_API_KEY` (direct TypeSafe billing). Only those names
are used; other env entries are not loaded into the process. Do not put secrets in
CLI arguments or result files. `--prepare` and `--report` make no model calls.

If one key is missing, run that arm separately:

```bash
npm run eval:decisions -- --provider claude --env /Users/caro/Code/onboarding/.env
npm run eval:decisions -- --provider jev --env /Users/caro/Code/onboarding/.env
npm run eval:decisions -- --report
```

The default is eight deliberately varied development cases: 01, 02, 03, 13, 15,
17, 20, 26. Use `--cases 01,17` for a smaller smoke comparison. Results are saved
under `evals/decision-comparison/results/`. Every successful case/model call is
cached by the full request hash, experiment version and model. Resume with the
same command after an error; completed calls are reused. No automatic retries.
Changing cases for a subset is safe; use a new `--out` directory when changing
the source run, questions, model or experiment version. Never overwrite previous
answers to tune against the same examples.

Models are pinned to `claude-sonnet-4-6` and `jev-1.14.0` (available through Gateway
since October 15). Jev's version was updated before any successful Jev call. The
Claude requests, questions, expected answers and cached results are unchanged. Each arm receives
the same deterministic batches of at most 24 questions, sequentially; raw usage,
duration and estimated cost are stored. Small named-answer batches avoid Claude's
large-schema grammar limit. Successful batches are checkpointed individually.
Budget a few dollars for the eight-case Claude arm; Jev costs much less by its
published token rates; Gateway's reported billed cost is used when returned.
There is no generation of final draft prose in this test.

### Gateway account prerequisite

On 2026-10-18 the local Gateway key successfully listed the decision models. The
initial card-verification requirement was resolved by Caroline, but inference now
returns HTTP 403 `no_providers_available` / `RestrictedModelsError`: Jev requires
**paid Gateway credits**, and free credits are not eligible. Confirmed on both
Jev 1.14 and 1.13 with small diagnostic requests. **No Jev eval calls have completed**,
so there is no quality verdict yet. Caroline must decide whether to fund Gateway;
the agent has not purchased credits. After funding, resume the Jev command above. There is no need
to rerun Claude, deploy Vector, or run `vercel ai-gateway setup`; that setup command
configures local coding agents, while this script calls the documented HTTP API.

## Fairness and scope

- Reuses extraction from `evals/runs/2026-10-14-feature4-r1.json`, fixed before the comparison.
- Both arms get identical state (transcript, extraction, board, people, recorder)
  and identical atomic Choice questions, including unknown/review options.
- Expected answers and previous Claude decisions never enter provider requests.
- The question keys themselves are not used in Jev inference, so instructions
  explicitly identify the candidate and prerequisite being judged.
- Full questions include the same general domain policy for both providers.
- Jev's independent Choice evaluation is compared with Claude answering the same
  narrow contract in one structured-output request. This is not a direct benchmark
  of the current tool-calling orchestrator, which has a different prompt/interface.
- Both use the same deterministic projection and the existing golden scorer.
  Multiple updates to the same task are merged. Updates cannot silently become
  new tasks; unresolved decisions and dependency cycles are reported for review.
- Candidate availability is heuristic title/quote matching, and needs human review.
  Correct-action and correct-person metrics keep missing tasks in their denominators.
- Expected dependency recall includes capability-gap expectations. Extra links are
  shown in the review report, not silently treated as correct. Inspect false-positive
  dependencies as well as recall before claiming improvement.
- Customer matching, dates, priorities, notes quality, free-form draft wording and
  approval execution are outside this experiment. A model winning here still needs
  an end-to-end test of Claude drafting from its decisions.
- This is an exploratory, error-enriched development sample, **not held-out evidence**.
  Do not tune repeatedly on it and claim general improvement. Confirm any promising
  change on fresh, human-labelled examples with repeated runs.
- Probabilities are preserved for Jev; Claude is not asked to invent equivalent
  confidence numbers. No confidence threshold is chosen on the evaluation examples.

## Outputs

- `manifest.json`: source checksum, source commit/model, cases, model versions and scope.
- `requests.json`: exact inputs to both providers, without answer keys.
- `extraction-audit.json`: candidate coverage and possibly missing expectations.
- `<case>-<provider>.json`: raw response, typed answers, usage, timing and request hash.
- `<case>-<provider>-part-N.json`: checkpoints for identical question batches.
- `scores.json`: projected proposals, per-field checks, gaps, unresolved decisions.
- `REPORT.md`: readable side-by-side decisions, evidence, links and counts.

Review whether the expected task is absent from extraction, lost by the decision
stage, assigned incorrectly, or linked incorrectly. Only after that comparison is
credible should this be wired into a local full-pipeline experiment.

## Sources checked 2026-10-18

- [TypeSafe HTTP API](https://docs.typesafe.ai/api)
- [Vercel's TypeSafe-compatible endpoint](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe)
- [Models, pinned versions and pricing](https://docs.typesafe.ai/models)
- [How to build narrow decisions](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)
- [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

Jev rates are $0.042 per million input tokens, output free. Claude estimates use
the repository's Sonnet 4.6 rates ($3 input / $15 output per million). Estimates
are labelled estimates; response usage is retained for reconciliation.
