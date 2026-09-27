# Linear and Attio Integration Evaluation

_Evaluated against the repository and official vendor documentation on 2026-09-27._

## Scope

This document evaluates adding Linear and Attio integrations to Vector. It covers the existing integration plan and architecture, vendor requirements, gaps, risks, and a recommended implementation sequence.

No integrations, webhooks, credentials, accounts, or application settings were changed as part of the evaluation.

## Executive summary

Both integrations are feasible and fit Vector's webhook-first architecture. However, `AI_PLAN.md` currently understates the implementation work: the event-ingestion foundation is reusable, but the current AI orchestrator is explicitly designed for Miniti transcripts and cannot directly process Linear and Attio events.

| Area | Linear | Attio |
|---|---|---|
| Technical feasibility | High | High |
| Best initial auth | Personal API key or manually configured webhook for one workspace | Single-workspace API key |
| Production SaaS auth | OAuth app | OAuth app with workspace-level token |
| Relevant webhook | `Issue` updates | Usually `list-entry.updated` for a configured stage attribute |
| Signature | HMAC-SHA256 over raw body | HMAC-SHA256 over raw body |
| Delivery timeout | 5 seconds | 5 seconds |
| Retries | 3 retries: 1 minute, 1 hour, 6 hours | Up to 10 attempts over approximately 3 days |
| Main unresolved problem | Mapping Linear issues to Vector tasks and onboardings | Defining which list/object and status attribute represent the relevant deal stage |
| Relative effort | Medium | Medium-high |

### Recommendation

Implement the integrations sequentially:

1. Build shared, source-neutral webhook ingestion infrastructure.
2. Implement Linear first because its issue events are richer and the initial event-to-task behavior is clearer.
3. Implement Attio second, after confirming the exact Attio data model and desired stage-to-action mapping.

## Assessment of the current plan

The relevant plan is in `AI_PLAN.md`, particularly the webhook ingestion and future Linear/Attio sections.

### What the plan gets right

The following decisions align with both vendors' recommendations:

- Use webhooks rather than polling.
- Verify webhook authenticity before processing.
- Persist external events before downstream work.
- Acknowledge webhook delivery quickly.
- Perform slower processing asynchronously.
- Preserve manual review through `PendingAIChange`.
- Retain raw payloads for diagnostics.
- Make event ingestion idempotent.
- Surface unmatched events for manual assignment.

The existing `ExternalEvent` and `PendingAIChange` models provide a useful foundation.

### Gaps to resolve

#### 1. The current orchestrator is Miniti-specific

`AI_PLAN.md` says Linear and Attio can use the same orchestrator with a smaller context payload. The current implementation in `lib/ai/orchestrator.js` is explicitly transcript-shaped and depends on:

- meetings and transcripts;
- speakers;
- extracted action items;
- reported completions;
- source quotations;
- meeting tone;
- a two-pass extraction and decision pipeline.

Linear and Attio events do not have this shape. They should share the draft-writing and approval infrastructure, but each source needs its own normalizer, resolver, and decision logic:

```text
Vendor webhook
  → verify signature
  → normalize vendor event
  → resolve onboarding/task
  → deterministic rule or source-specific AI decision
  → PendingAIChange
```

Many initial events should not require Claude. For example, a linked Linear issue entering a completed workflow state can deterministically propose a Vector task status update.

#### 2. Current deduplication will drop legitimate repeated updates

`ExternalEvent` currently has:

```prisma
@@unique([source, sourceId])
```

Using a meeting ID is mostly suitable for Miniti's current flow. It is not suitable for Linear and Attio entities that can change repeatedly. If `sourceId` stores a Linear issue ID or Attio list-entry ID, only the first update will be accepted and subsequent changes will be treated as duplicates.

Delivery identity should be used for idempotency:

- Linear: `Linear-Delivery`
- Attio: `Idempotency-Key`

The entity identity should be stored separately. A source-neutral event model should distinguish at least:

```text
deliveryId
entityType
entityId
eventType
```

`sourceId` could remain and hold the delivery ID, but its meaning and comments would need to be updated.

#### 3. Entity mapping is not designed

Selecting relevant teams, labels, lists, or stages filters noise but does not establish how a vendor entity maps to a Vector onboarding or task.

Explicit links are preferable to title matching or AI inference. A possible model is:

```text
ExternalEntityLink
- source
- externalType       // issue | project | deal | list-entry | company
- externalId
- externalUrl
- onboardingId?
- taskId?
- metadata
- unique(source, externalType, externalId)
```

This could support:

- Linear issue → Vector task
- Linear project → Vector onboarding
- Attio deal/list entry → Vector onboarding
- Attio company record → Vector company

Without explicit links, repeated ambiguous events are likely and matching will be fragile.

#### 4. Linear completion cannot rely on a status named "Done"

Linear workflows are team-configurable. Completion should use Linear's workflow-state category/type or a configured set of completed state IDs, not a literal status name.

The handler must inspect `updatedFrom` so it only acts when the workflow state actually changes. The product also needs to decide whether reopening a Linear issue should propose reopening its Vector task.

#### 5. "Attio deal stage changed" is underspecified

Attio is schema-flexible. A stage might be:

- a status attribute on a list entry;
- a status/select attribute on a deal record;
- part of a custom object or list.

The integration therefore needs concrete configuration:

- workspace ID;
- list or object ID;
- status/stage attribute ID;
- relevant status IDs;
- optionally the related company attribute.

For a list stage, the likely subscription is `list-entry.updated`, filtered by both `id.list_id` and `id.attribute_id`.

Attio webhook events identify the changed entity and attribute but generally require an authenticated API read to obtain the current values and related company information.

#### 6. Secret storage needs reconsideration

`IntegrationConnection.config` is described as storing source-specific secrets in JSON. Storing plaintext credentials in ordinary Postgres JSON would be risky.

For the current single-workspace deployment:

- application client secrets should remain in Vercel environment variables;
- webhook signing secrets should remain in environment variables;
- API keys should remain in environment variables.

For a future multi-workspace OAuth product:

- access and refresh tokens need encrypted-at-rest storage;
- secrets must be redacted from admin and debug responses;
- token rotation and revocation must be supported.

The current `source String @unique` design allows only one connection per source globally. That is acceptable for the current portfolio deployment but not for a multi-tenant product.

## Linear requirements

### Account and configuration

For a single-workspace pilot, Vector needs:

- access to the Linear workspace;
- workspace admin rights to configure or read webhooks;
- a publicly reachable HTTPS endpoint, such as `/api/integrations/linear/webhook`;
- a webhook signing secret;
- the relevant team IDs;
- relevant labels or projects;
- completed workflow-state IDs/categories;
- a decision on archived and cancelled issues.

A manually configured webhook is suitable initially. If additional API lookups are needed, a personal API key is sufficient for a one-workspace prototype.

For a reusable customer-facing integration, Vector would need:

- a registered Linear OAuth application;
- an OAuth callback endpoint;
- CSRF `state` validation;
- secure token and refresh-token storage;
- `read` scope for issue, team, and workflow metadata;
- `admin` only if Vector must programmatically create or read webhooks.

Linear warns that `admin` should not be requested unless necessary. OAuth application webhook settings can create a webhook automatically when an organization authorizes the app.

Linear OAuth access tokens currently last 24 hours and are renewed with rotating refresh tokens.

### Webhook handling

The receiver should:

1. Read the raw request body.
2. Calculate HMAC-SHA256 with the signing secret.
3. Compare it to `Linear-Signature` using a timing-safe comparison.
4. Validate that the webhook timestamp is recent, approximately within one minute, to prevent replay.
5. Validate the event type and action.
6. Confirm the relevant field changed via `updatedFrom`.
7. Deduplicate using `Linear-Delivery`.
8. Persist the event.
9. Return HTTP `200` within five seconds.
10. Process asynchronously.

Linear retries failed or slow deliveries after approximately 1 minute, 1 hour, and 6 hours. Repeated failures can disable the webhook.

### Recommended initial subscription

Start narrowly:

- resource type: `Issue`;
- one relevant team rather than all public teams;
- server-side filtering for relevant labels/projects and real state transitions;
- process only explicitly linked issues once entity links exist.

Comments and other resource types should be deferred until they have a defined product behavior.

### Suggested MVP behavior

```text
Linked Linear issue enters a completed workflow state
→ persist verified event
→ create pending Vector update-status draft
→ vendor reviews and approves
→ linked Vector task becomes Done
```

This first slice can be deterministic. Claude is only potentially useful later for suggesting a task match when no explicit link exists.

### API considerations

Linear uses GraphQL at `https://api.linear.app/graphql`.

Current documented limits include:

- personal API key: 2,500 requests/hour per user;
- OAuth app: 5,000 requests/hour per user or app user;
- maximum single-query complexity: 10,000 points.

GraphQL responses may return HTTP `200` with an `errors` array, so callers must inspect both the HTTP response and GraphQL result.

## Attio requirements

### Account and configuration

For a single-workspace pilot, Vector needs:

- an Attio workspace;
- access to the developer settings;
- a workspace-level API key;
- at minimum `webhook:read-write` to create a webhook;
- read scopes for the list, entry, deal, company, and attribute resources that processing needs;
- the relevant list/object ID;
- the stage/status attribute ID;
- relevant status IDs;
- the relationship between the deal/list entry and company record.

For a reusable integration, Vector would need:

- an Attio OAuth application;
- authorization and callback routes;
- CSRF `state` validation;
- a workspace-level token, because webhook administration endpoints are workspace-level only;
- encrypted token storage and revocation handling.

Attio recommends OAuth for multiple workspaces and a manually generated API key for a single workspace.

### Webhook creation

Attio webhooks can be created in developer settings or through:

```text
POST https://api.attio.com/v2/webhooks
```

Creating a webhook requires `webhook:read-write` and a workspace-level token. The API response includes the webhook secret, which must be retained securely.

Attio enforces uniqueness across the combination of target URL, event type, and filter. Duplicate subscriptions return HTTP `409`.

### Recommended subscription

Assuming onboarding stage is a list-entry status attribute:

- event: `list-entry.updated`;
- filter by `id.list_id`;
- filter by `id.attribute_id` for the stage/status attribute.

Filtering at the webhook level is strongly preferable to receiving every Attio update.

### Webhook handling

The receiver should:

1. Read the raw UTF-8 body.
2. Compute HMAC-SHA256 using the webhook secret.
3. Compare it with `Attio-Signature` or the legacy `X-Attio-Signature` using a timing-safe comparison.
4. Deduplicate using `Idempotency-Key`.
5. Validate the expected event type, list ID, and attribute ID.
6. Persist the event.
7. Return a `2xx` response within five seconds.
8. Fetch the current entry/record state through Attio's API.
9. Resolve the linked company/onboarding.
10. Apply a configured deterministic rule or create a pending draft.

Attio guarantees at-least-once delivery and may send duplicates. It retries non-`2xx` responses or timeouts up to 10 times over approximately three days, then marks the webhook degraded.

Webhook delivery is limited to 25 requests/second per target URL.

### Suggested MVP behavior

The product behavior needs to be specified as an explicit mapping, for example:

```text
Attio stage changes from "Closed won" to "Onboarding"
→ resolve linked company
→ find active Vector onboarding
→ propose prioritising a configured kickoff task
```

If entering the stage should create a new Vector onboarding, that is a larger workflow than the current plan describes and needs dedicated onboarding-creation drafts and duplicate prevention.

### API considerations

Attio's documented general API limits are:

- 100 read requests/second;
- 25 write requests/second;
- additional score-based limits on list records and list entries.

HTTP `429` responses include a `Retry-After` header and are safe to retry after the reset time.

## Shared implementation shape

The reusable boundary should be ingestion and normalized events, not the Miniti transcript orchestrator.

```text
/api/integrations/linear/webhook
/api/integrations/attio/webhook
            │
            ▼
raw-body signature verification
            │
            ▼
delivery-level idempotent ExternalEvent insert
            │
            ▼
source-specific event normalization
            │
            ▼
explicit ExternalEntityLink lookup
            │
      ┌─────┴─────┐
      │           │
 resolved      unresolved
      │           │
      ▼           ▼
deterministic   Needs your input
rule/draft      assignment queue
      │
      ▼
PendingAIChange → existing approval path
```

Recommended source-specific modules:

```text
lib/integrations/webhook-security.js
lib/integrations/linear.js
lib/integrations/attio.js
app/api/integrations/linear/webhook/route.js
app/api/integrations/attio/webhook/route.js
```

Each integration should include fixture-driven tests for:

- valid signature;
- invalid signature;
- malformed body;
- stale/replayed delivery where applicable;
- duplicate delivery;
- irrelevant event;
- valid resolved event;
- unmatched event;
- API enrichment failure;
- background processing failure;
- retry delivery after a previous persisted event.

## Decisions needed before implementation

### Linear

1. Which team or teams are in scope?
2. Which labels or projects identify customer-onboarding work?
3. Should only explicitly linked issues affect Vector tasks?
4. How is the initial link created?
5. Does reopening an issue reopen the Vector task?
6. Are cancelled issues ignored, blocked, or treated as completion?
7. Is this a one-workspace integration or an OAuth feature for future customers?

### Attio

1. Does the Attio workspace and required plan/access exist?
2. Is the relevant entity a deal record, company record, or list entry?
3. Which list/object contains the onboarding signal?
4. Which exact attribute represents stage?
5. Which stage transitions matter?
6. What Vector action should each transition propose?
7. How is an Attio record linked to a Vector company/onboarding?
8. Should entering an onboarding stage create a Vector onboarding or only affect an existing one?
9. Is this a one-workspace integration or a reusable OAuth feature?

## Recommended delivery sequence

### Phase 0: Resolve product mapping

- Answer the decisions above.
- Inspect the actual Linear and Attio workspace schemas.
- Define the event-to-draft matrix before coding.

### Phase 1: Shared ingestion hardening

- Separate delivery identity from external entity identity.
- Introduce explicit external entity links.
- Add raw-body HMAC helpers.
- Ensure connection secrets are not stored in plaintext JSON.
- Add source-neutral normalized event conventions.

### Phase 2: Linear MVP

- Add signed issue webhook receiver.
- Subscribe to the selected team and `Issue` events.
- Detect transitions into completed workflow-state categories.
- Resolve explicit issue-to-task links.
- Create `update_status` drafts through the existing approval flow.
- Add fixtures, tests, diagnostics, and connection health.

### Phase 3: Attio MVP

- Confirm the actual list/object/status configuration.
- Add signed, filtered webhook receiver.
- Fetch the current entry/record after an update.
- Resolve the related company/onboarding through explicit links.
- Apply the agreed stage-to-draft mapping.
- Add fixtures, tests, diagnostics, and connection health.

### Phase 4: OAuth and multi-workspace support

Only pursue this when Vector is moving beyond the current single-vendor portfolio deployment. It requires tenant-aware connections, encrypted credentials, OAuth callback flows, token refresh/revocation, and per-workspace webhook lifecycle management.

## Overall conclusion

The integrations are worth pursuing and the current event/draft infrastructure provides a meaningful head start. Linear is the better first implementation.

The main prerequisite is not vendor API access; it is defining reliable external entity links and precise event-to-action rules. Implementing webhook handlers before those decisions would produce technically valid integrations that generate ambiguous or misleading drafts.

## Official documentation reviewed

### Linear

- [Webhooks](https://linear.app/developers/webhooks)
- [OAuth 2.0 authentication](https://linear.app/developers/oauth-2-0-authentication)
- [GraphQL API: Getting started](https://linear.app/developers/graphql)
- [Rate limiting](https://linear.app/developers/rate-limiting)

### Attio

- [Authenticating requests](https://docs.attio.com/rest-api/guides/authentication)
- [Configuring webhooks](https://docs.attio.com/rest-api/guides/webhooks)
- [Create a webhook](https://docs.attio.com/rest-api/endpoint-reference/webhooks/create-a-webhook)
- [List webhooks](https://docs.attio.com/rest-api/endpoint-reference/webhooks/list-webhooks)
- [Handling rate limits](https://docs.attio.com/rest-api/guides/rate-limiting)
- [List entry updated](https://docs.attio.com/rest-api/webhook-reference/list-entry-events/list-entryupdated)
