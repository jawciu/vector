# Realism Plan — Making the Portfolio Data Look Like a Real Product

Living plan for growing the demo data into a believable, living book of business.
Companion plan: [EVALS_PLAN.md](EVALS_PLAN.md) (this plan feeds it — more meetings = more eval data).

**Status: PLANNED — nothing executed yet. No data has been changed.**

---

## The fiction (agreed 2026-07-09)

**Vector** is a ~40-person company selling an **agentic analytics platform** (think
Lightdash: BI built on dbt, with an AI analyst layer). This app is Vector's internal
onboarding tool. Every company in the DB is a customer being onboarded onto the
analytics platform; every task is implementation work (warehouse connection, dbt
project setup, semantic layer, dashboards, SSO, training, go-live); every meeting is
an implementation call.

This story was chosen because:
- The customers are researched **real startups/scale-ups** — several are literally
  Lightdash/Omni customers in real life, so the cast is maximally plausible.
- Implementation work for BI-on-dbt has rich natural dependencies (can't define
  metrics before the project compiles; can't compile before the repo is connected;
  can't connect before the service account exists) — perfect for `blockedByTaskId`.
- Meeting content writes itself: kickoffs, weekly syncs, technical working sessions,
  training, go-live reviews — all with concrete, transcribable action items.

Vendor team emails use `@vector.test` (matches the existing e2e user domain).

---

## Principles (non-negotiable)

1. **Additive only.** Nothing existing is deleted. Existing companies, onboardings,
   tasks, users, drafts, and events all stay. Stale *Active* onboardings get
   `status: "Archived"` (Caroline approved this — status edit, not deletion).
2. **All dates relative to run date.** The root cause of the "everything is overdue"
   problem is `prisma/seed.js` hardcoding dates around Feb 21, 2026. Every new script
   computes dates as offsets from `Date.now()` so the portfolio still looks alive in
   October. **Every script that fabricates dates must carry a top-of-file comment
   stating this is demo-only** — e.g. *"DEMO DATA ONLY: timestamps (createdAt,
   resolvedAt, activity history) are fabricated relative to the run date so the
   portfolio looks recently active. A real product would never backdate records —
   these fields are normally write-once, set by the DB at insert time."* Same note
   on the meeting backdate pass (Step 5).
3. **Respect DB invariants.** `Task.number` per-company counter + `Company.taskCounter`,
   `@@unique([companyId, number])`, the `task_company_consistency` trigger, and the
   prefix CHECK `^[A-Z][A-Z0-9]{1,4}$`. Follow the `seedTasksForCompany` pattern from
   `prisma/seed.js` (explicit numbers via `createMany`, then set `taskCounter`).
4. **Meetings go through the real pipeline.** Fixture payloads are POSTed to the real
   Miniti webhook so the orchestrator, matching, drafts, and `AICall` logging all
   exercise the real code — this is what makes the data usable for evals.
5. **Idempotent + tagged.** Like `seed-recent-activity.js`: re-running never duplicates.

---

## Step 0 — Archive the stale corpus (5 min)

- Set `status: "Archived"` on old **Active/Paused** onboardings whose open tasks are
  months overdue. Leave old **Completed** onboardings untouched — completed history is
  good realism.
- **Fixture retarget: ✓ DONE (2026-07-09).** `prisma/seed-ai-test-fixtures.js` no
  longer hardcodes Acme — it resolves the first Active onboarding with phases +
  tasks (override: `E2E_TARGET_PREFIX`), writes the result to
  `e2e/.auth/target.json`, and the Playwright specs read it via `e2e/target.js`.
  Verified: resolves to the same target as before today (onboarding 11, AC), full
  e2e suite passes (5/5). Archiving Acme now retargets the tests automatically.

## Step 1 — Company logos + avatar upgrade (small code change)

Schema: add `Company.logoUrl String?` (nullable, no tightening needed — one migration,
`npx prisma generate`, restart dev server).

Assets: download each company's real logo once → `/public/logos/<slug>.png` (or .svg),
committed to the repo. Sourcing gotchas found in research: **patch.io** not patch.com,
**loopreturns.com** not loop.com, **helloalma.com** (several Almas),
**generationhome.com** for Gen H. JustWatch and Raycast have proper press/brand pages.

> Note: real trademarks in a public portfolio repo is standard for demo projects
> (nominative use), but it's Caroline's name on it — flagging once, then proceeding.

UI: upgrade `app/ui/CompanyAvatar.js` to render `logoUrl` via `next/image` with the
existing initials+color as fallback (same pattern as the person-avatar branch in
`TaskDrawer.js`). Then replace the four inline company-initial blocks with the shared
component: `WorkspacesTable.js:79`, `OnboardingDetailClient.js:463`,
`CreateOnboardingModal.js:249/:299`, `CreateTaskModal.js:256`. Old companies have
`logoUrl: null` → render exactly as today (desktop-safe, zero visual change for
existing rows).

Vendor-user avatars: add 4 new headshot PNGs in the existing `/public/avatar-*.png`
style and extend `AVATAR_IMAGES` in `lib/avatar.js` (keeping the current mechanism —
no schema change needed for people).

## Step 2 — The cast: 12 real companies

Chosen from researched candidates (1–8 are real Lightdash/Omni customers in real
life). Prefixes are set **explicitly** in the seed — `derivePrefix` would produce
different/colliding values (e.g. Sylvera→SY, The Rounds→TH). None collide with the
existing set (AC, TE, GL, IN, UM, ST, WA, CY, SO, WO); all match the CHECK regex.

| Company | Domain | Vertical | Prefix | Lifecycle role (Step 4) |
|---|---|---|---|---|
| fal | fal.ai | AI infra / devtools | FAL | Mid-flight, healthy |
| Gen H | generationhome.com | Fintech (UK mortgages) | GENH | Mid-flight, **at-risk** (security review stalled) |
| JustWatch | justwatch.com | Media / consumer | JW | Near go-live |
| Qargo | qargo.com | Logistics SaaS | QRG | Mid-flight, healthy (embedded-analytics use case) |
| Ubie | ubiehealth.com | Health tech | UB | Completed (history) |
| The Rounds | therounds.co | E-comm / climate DTC | TR | Fresh (kicked off last week) |
| Ordermentum | ordermentum.com | B2B marketplace | ORD | Completed (history) |
| Standard Metrics | standardmetrics.io | Fintech / VC tooling | SM | Mid-flight, **at-risk** (champion gone quiet) |
| Sylvera | sylvera.com | Climate data | SYL | Near go-live |
| Loop Returns | loopreturns.com | E-commerce infra | LOOP | Mid-flight, healthy |
| Alma | helloalma.com | Health (mental health) | ALM | Completed (history) |
| Raycast | raycast.com | Devtools | RAY | Fresh (kickoff scheduled) |

Alternates if any logo/name proves awkward: Peerspace (PEER), Huel (HUEL),
Tatango (TAT), Neo Financial (NEO), Patch (PAT).

Every company gets `domain` set — this is what the Miniti attendee-matching heuristic
keys on, so seeded meeting payloads with `attendees[].domain` auto-match correctly.

## Step 3 — People (+4 vendor users, ~30 contacts)

**Vendor team** (VendorUser, `authUserId: null` — no Supabase accounts needed, they
still work as task owners everywhere; the orchestrator already offers them as owner
candidates via `lib/integrations/miniti.js:307`):

| Name (fictional) | Email | Role in fiction |
|---|---|---|
| Maya Lindqvist | maya@vector.test | Implementation Manager |
| Theo Okonkwo | theo@vector.test | Solutions Engineer |
| Ines Ferreira | ines@vector.test | Customer Success Manager |
| Sam Whitfield | sam@vector.test | Implementation Manager |

Caroline's existing user stays the "Head of CS" who owns a couple of onboardings.

**Contacts** (2–4 per onboarding, fictional people at real domains — never real
employees): Head of Data / Analytics Lead (sponsor), Analytics Engineer (champion),
Data Platform / IT admin (SSO + warehouse), occasionally a Security reviewer. Vary
`lastSeenPortalAt`: recent for healthy onboardings, 12+ days ago for the
champion-gone-quiet story, `bouncedAt` on one contact for texture.

## Step 4 — The growth seed: `prisma/seed-portfolio-growth.js`

New additive, idempotent script (sibling of `seed-recent-activity.js`; raw Prisma +
adapter like `seed.js`; tag via a marker in a known field or check-before-create by
company name). All dates as `daysAgo(n)` / `daysFromNow(n)` helpers.

**Lifecycle mix** (~15 onboardings across the 12 companies — one company can have two,
e.g. Qargo "Pilot" completed + "Embedded analytics rollout" active):

- **2 fresh** (created 3–10 days ago): Kickoff phase mostly done, everything else
  Not started. Near-term due dates, nothing overdue.
- **6 mid-flight**: the busy middle. Phases 1–2 complete, phase 3–4 in progress.
  In-progress and blocked tasks, recent comments, dependencies visible on the board.
  Two of these are **at-risk**: Gen H (infosec questionnaire sitting 3 weeks →
  blocked chain: security review → service account → repo connection) and
  Standard Metrics (champion quiet: `lastSeenPortalAt` 14 days, stale tasks,
  overdue follow-ups). These two carry most of the overdue budget.
- **2 near go-live** (`targetGoLive` 1–3 weeks out): phases 1–4 complete, training +
  go-live review in flight. One has a genuine crunch (parity sign-off pending).
- **3–4 completed** (finished 2–14 weeks ago, `status: "Completed"`): all tasks Done
  with plausible historical `createdAt` spread, phases `isComplete`.

**Overdue budget:** 10–15% of *open* tasks, overdue by 2–9 days (not months),
concentrated in the two at-risk onboardings. Everything else due in the future.

**Tasks** (~250–350 total): from the researched 6-phase implementation playbook —
Kickoff & Discovery → Technical Setup & Connectivity → Semantic Layer & Modeling →
Content Build & Migration → Security, Governance & Access → Training, Rollout &
Go-live. Real titles ("Provision Snowflake service account with read-only access to
ANALYTICS schema", "Add Lightdash static IPs to warehouse network policy", "Define
first 10 metrics in dbt .yml", "Configure Okta SAML SSO", "Validate migrated numbers
against Looker (parity sign-off)", "Run developer training: metrics-as-code
workflow"), plus 1–2 agentic-flavor tasks per onboarding ("Enable AI analyst for
pilot group", "Set guardrails for AI-generated queries"). Each template row carries:
owner side (vendor → `ownerId` = a VendorUser; customer → `assigneeContactId`),
`blockedByTaskId` dependencies within the phase chain, priority, and a status
appropriate to the onboarding's lifecycle stage. Per-company task numbering follows
the `seed.js` `createMany` + `taskCounter` pattern.

**Texture:** comments on ~20% of tasks (short, dated, from both sides — bump
`commentCount`); backfilled `ActivityLog` rows (`created`, `completed`,
`status_changed`, `assigned`, `commented`, `link_activated`) spread over each
onboarding's lifetime so feeds and health scoring have history; a few `File` rows
(security questionnaire PDF, dbt audit doc) if cheap.

## Step 5 — Meetings through the real pipeline (~20 backdated)

Write ~20 realistic Miniti payloads (fixtures in `prisma/fixtures/meetings/`, matching
Ian's spec exactly — `action_items`, `key_decisions`, `notes`, `transcript[]` with
speaker turns, `attendees[]` with real company domains). Content per the researched
cadence: kickoffs, weekly syncs (action-item review, blocker chasing), technical
working sessions ("Add metrics block to fct_orders.yml"), a training session, a
go-live review. `meeting.date` backdated across the last ~8 weeks — `occurredAt`
derives from it, so meeting timelines are automatically historical.

Inject via the **real webhook** (`scripts/test-miniti-webhook.sh` pattern) against the
local dev server → real matching, real orchestrator, real Claude calls (~20 × ~$0.02 ≈
**under $1 total**), real `PendingAIChange` drafts, real `AICall` rows.

Then a small **backdate pass** (same script, phase 2): set
`ExternalEvent.receivedAt/processedAt` ≈ `occurredAt`, and for older meetings resolve
their drafts realistically — approve ~80% via the real approve API (some with
`overrides` = edited-then-approved), reject ~20% with plausible `rejectedReason`s —
then backdate `PendingAIChange.createdAt/resolvedAt` and the `createdAt` of
approval-created tasks. Drafts from the most recent 2–3 meetings stay **pending** so
the `/ai-drafts` inbox is populated for demos. This resolution history is exactly the
accept-rate/calibration data [EVALS_PLAN.md](EVALS_PLAN.md) charts.

Include 1–2 deliberately **ambiguous** meetings (no attendees, generic title) so
"Needs your input" has a live example.

## Step 6 — Playwright polish session (last)

One browser session of "today's activity" on top — create a task, drag Kanban cards,
approve a pending draft, leave a comment or two — doubling as exploratory QA (empty
states, drag-and-drop, validation). ~20 interactions, not a volume tool.

---

## Execution order & effort

| # | Work | Size |
|---|---|---|
| 0 | Archive stale onboardings (~~retarget AC fixtures~~ ✓ done — now dynamic) | XS |
| 1 | `logoUrl` migration + CompanyAvatar upgrade + logo/headshot assets | S |
| 2–4 | `seed-portfolio-growth.js` (companies, users, contacts, onboardings, tasks, deps, comments, activity) | **L — the main build** |
| 5 | 20 meeting fixtures + webhook injection + backdate/resolution pass | M (fixture writing is the bulk) |
| 6 | Playwright today-session + QA notes | S |

Needs from Caroline: none blocking — dev server + `ANTHROPIC_API_KEY` for Step 5
(≈$1), and a skim of the meeting fixtures if she wants a voice check before injection.
