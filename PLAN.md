# Onboarding Orchestrator — Plan

Portfolio-strong B2B onboarding workflow tool. Lightweight, fast-to-adopt, customer-obsessed.

*Caroline calls the AI assistant "Cakes".*

---

## Vision

The onboarding tool that B2B vendors actually use — because it's lightweight enough to adopt in a day, and good enough that customers don't ignore it.

**Core thesis**: Most onboarding tools optimize for the vendor's internal project management. We optimize for the *shared experience* — making it dead simple for both sides to stay aligned, with AI handling the tedious follow-up work.

---

## ICP (Ideal Customer Profile)

**Primary**: B2B SaaS companies, Seed to Series B (10–150 employees).

| Attribute | Detail |
|-----------|--------|
| Product type | Requires implementation or guided setup (not pure self-serve) |
| Team size | CS / Implementation team of 1–8 people |
| Onboarding volume | 10–50 concurrent onboardings |
| Current tools | Spreadsheets, Notion, Asana/Monday hacked for onboarding |
| Pain | Customers go dark, time-to-value too long, churn in first 90 days |
| Budget | Not ready for $30k/yr enterprise tooling — need something they can adopt fast |

**Why this ICP**: These teams feel onboarding pain acutely but can't justify enterprise tools like Rocketlane or GuideCX. They're hacking together spreadsheets and project management tools. They want something purpose-built that doesn't require a 3-month rollout.

**Secondary ICP (later)**: Mid-market vendors (200–1000 employees) with dedicated onboarding/implementation teams who've outgrown spreadsheets but find enterprise tools too rigid.

---

## Industry gaps we exploit

| Problem in existing tools | Our approach |
|---------------------------|-------------|
| Too heavy — Gantt charts, resource allocation, enterprise PM features | Lightweight: shared checklist with smart status tracking. Set up in minutes. |
| CRM-locked — Arrows = HubSpot only, TaskRay = Salesforce only | CRM-agnostic. Integrate later via API, don't require it. |
| Customer portal is an afterthought — clunky, requires login | Zero-friction customer view: magic link, no account, mobile-friendly. |
| Communication lives elsewhere — tracking in tool, chasing in email | Communication *through* the tool: follow-ups, messages, nudges, all in one timeline. |
| Health is binary — "on track" or "off track" with no nuance | Predictive health: pattern-based risk scoring, overdue velocity, customer engagement signals. |
| Templates are rigid | Template → customize per customer → evolve as you learn. |

---

## Roles & views

### Vendor side

| Role | Primary view | What they need |
|------|-------------|----------------|
| **Implementation Manager** | Onboarding detail (Kanban + timeline) | Day-to-day task management, customer communication, file collection, the main operator |
| **CS Manager** | Portfolio dashboard | Health across all onboardings, escalation alerts, handoff context from sales |
| **Solutions Engineer** | Technical tasks view | Integration checklists, configuration steps, technical blocker tracking |
| **VP / Head of CS** | Reporting dashboard | Time-to-value metrics, bottleneck patterns, team workload distribution |
| **Sales (handoff)** | Handoff form | Pass deal context, requirements, key contacts to the implementation team |

### Customer side

| Role | Primary view | What they need |
|------|-------------|----------------|
| **Project Champion** | Progress overview | "Are we on track?", what they need from their own team, next steps |
| **Technical Lead** | Their assigned tasks | Specific tasks, file uploads, configuration steps, technical details |
| **IT Admin** | Security/access tasks | SSO setup, data access, security review checklist |
| **Executive Sponsor** | Status summary | High-level progress — don't waste their time with task-level details |

All customer roles access via **magic link** — no account creation, no password, no friction.

---

## Product

### Three layers

1. **Vendor workspace** — Full control. Create onboardings from templates, manage tasks, assign owners, track health, communicate with customers. All roles on the vendor team can collaborate here.
2. **Customer portal** — Lightweight shared view. Customers see their tasks, progress, and next steps. Can complete tasks, upload files, leave comments. Magic-link access, no login required.
3. **AI layer** — Sits on top of both. Drafts follow-ups for blocked tasks, surfaces risk patterns, suggests next actions. Human always approves before anything is sent.

---

## Feature breakdown

### Phase 1 — Core (make it work)

The foundation. A vendor can create and manage onboardings, and a customer can see their progress.

#### 1.1 Task CRUD
- Create / edit / delete tasks within an onboarding
- Fields: title, status (Todo / In progress / Blocked / Done), due date, owner (vendor or customer contact), "waiting on" (person), notes
- Inline editing on the Kanban board
- Bulk status updates (select multiple → mark as Done)

#### 1.2 Onboarding CRUD
- Create new onboarding: select or create company, assign owner, set target go-live date
- Edit onboarding: rename, change owner, update status, adjust timeline
- Archive / delete onboarding
- Duplicate onboarding (basis for templates later)

#### 1.3 Contact model
- Add customer contacts to an onboarding: name, email, role (Champion, Technical Lead, IT Admin, Exec Sponsor, custom)
- Contacts are the people on the customer side — tasks can be assigned to them
- Contact per onboarding (same person can appear in multiple onboardings)

#### 1.4 Phases as Kanban columns

- Kanban columns **are** phases: Kickoff → Configuration → Data Migration → Training → Go-Live (default template)
- Vendors can rename, add, remove, or reorder columns — same flexibility as a standard Kanban board
- Dragging a card between columns changes its **phase**, not its status
- Task status (To do, In progress, Blocked, Done) lives on the card as a tag/badge — filterable, not structural

**Dependencies & blocking:**
- **Blocked by (task)**: user can pick another task from the same onboarding. Task is auto-blocked until the dependency is marked Done.
- **Waiting on (person)**: user can pick a contact from the onboarding or manually enter a name. This is a manual block — user sets it, user clears it.
- Both result in the Blocked tag on the card.

**Status tags:**

| Tag | How it gets set |
|-----|----------------|
| To do | Default when task is created |
| In progress | User sets it manually |
| Blocked | Automatic when a "blocked by" task isn't Done, or manual when "waiting on" a person |
| Done | User ticks the checkbox on the card |

**Done behavior:** ticking a task marks it Done → card hides from the board by default. Board shows active tasks only (already implemented).

**Filtering:** filter bar to show/hide by status — active (To do + In progress + Blocked) by default, Blocked only, Done only, All.

**Phase progress:** progress bar at the top of each column showing X of Y tasks done (includes hidden completed tasks).

**Phase completion:** phase auto-completes when all its tasks are marked Done. Manual override available (mark phase complete even with open tasks).

**Target dates:** target date per phase, displayed in the column header.

#### 1.5 Health scoring v2 ✅

Health is computed per onboarding from its tasks + project dates. Returns `{ status, reasons }`.

**Status hierarchy** (worst wins):
| Status | Condition |
|--------|-----------|
| **Blocked** | ≥ 30% of tasks have status "Blocked" |
| **At risk** | Any of: some tasks blocked (< 30%), overdue tasks, or behind velocity |
| **On track** | None of the above |

**Overdue rules:**
- 1 task overdue by ≥ 7 days → At risk
- 3+ tasks overdue by ≥ 1 day → At risk

**Velocity check** (only when target go-live date exists and ≥ 7 days have elapsed):
- Completion rate = tasks done / days since onboarding created
- If `tasks remaining / completion rate > days until go-live` → At risk ("Behind pace — X tasks left, Yd to go-live")
- Past go-live with open tasks → At risk
- No tasks completed after 7+ days → At risk

**Health reasons** — collected as string array, shown as tooltip on health pill (e.g. "4 of 12 tasks blocked · 2 tasks overdue"). Multiple reasons can fire simultaneously.

**Schema** — Added `createdAt` (DateTime) to Onboarding model for velocity calculation.

- Deferred: days since last customer activity (stale = risk) — needs clearer definition of what counts as "customer activity"

#### 1.6 Vendor auth + roles
- Vendor team members sign up / log in (Supabase Auth, email/password first, OAuth later)
- Roles: Admin (full access), Member (manage assigned onboardings), Viewer (read-only)
- Onboarding ownership — each onboarding has a primary owner on the vendor side

---

### Phase 2 — Customer portal (make it shared)

The customer-facing experience. This is the differentiator — if customers actually use the portal, the whole product works. If they ignore it, it's just another internal PM tool.

#### Architecture decisions (decided March 2026)

**Auth strategy — custom UUID tokens, NOT Supabase magic links:**
- Supabase `signInWithOtp` creates `auth.users` rows — wrong model. Customers aren't users, they're scoped visitors.
- Custom tokens: UUID per contact per onboarding, stored in `MagicLink` table. Vendor generates, copies link, sends via their own email/Slack.
- Token on first visit sets an httpOnly cookie, then redirects to clean URL (`/portal/[onboardingId]`). Cookie proves identity on subsequent visits.
- Default expiry: 30 days (configurable). Vendor can revoke instantly. Resend = revoke old + generate new.
- Portal routes (`/portal/*`, `/api/portal/*`) bypass Supabase auth middleware entirely.

**Schema additions:**
- `MagicLink` model: token (UUID, unique), contactId, onboardingId, expiresAt, revokedAt, createdAt, lastUsedAt
- `assigneeContactId` FK on Task → proper link to Contact (not string matching — prevents name collision bugs)
- `File` model: taskId, fileName, storagePath, uploadedBy, contactId, fileSize, mimeType, createdAt
- Future: `owner` string on Task/Onboarding will become FK to VendorUser when team features are built (Phase 1.6)

**Portal route structure:**
- Entry: `/portal/[token]` → validate, set cookie, redirect to `/portal/[onboardingId]`
- Browsing: `/portal/[onboardingId]`, `/portal/[onboardingId]/tasks`, `/portal/[onboardingId]/all`
- Separate layout (no sidebar, no vendor nav). Desktop-first, fully responsive. Clean top bar, adapts well to mobile.
- Separate API routes under `/api/portal/` with token auth.
- Portal does NOT reuse vendor components. New lightweight portal-specific components.

**Progress display — NO percentages:**
- Tasks get added throughout an onboarding, so "34% complete" is misleading.
- Show: task summary counts (to do / in progress / done / blocked), segmented status bar per phase, health scoring, go-live countdown.
- Frame as "current status" not "progress toward completion."

#### 2.1 Magic-link access
- Vendor generates a magic link for each customer contact from the Members tab
- Link opens the customer portal for that specific onboarding — no login, no account
- Token per contact per onboarding: UUID, expirable (default 30 days), revocable
- Vendor can generate / copy / revoke / resend links from the onboarding detail page
- No email sending for MVP — copy-to-clipboard only.

#### 2.2 Customer portal pages (MVP — 3 pages)
- **Progress overview** (landing): health banner with reasons, task summary counts (to do / in progress / done / blocked), segmented status bar per phase, go-live countdown, upcoming deadlines
- **My tasks**: tasks assigned to this contact, grouped by phase. Can: mark done, add comments, upload files.
- **All tasks**: every task across all phases (read-only for non-assigned). Filter: All / My tasks / Completed.
- **Deferred**: Timeline/activity feed (needs ActivityLog model), dedicated Files page

#### 2.3 File uploads (included in MVP)
- Customers upload files against specific tasks (e.g., "Upload your SSO metadata XML")
- File types: documents, images, CSVs, configuration files (max 50 MB per file)
- Files stored in Supabase Storage (free tier: 1 GB)
- Vendor can download / review files from the task drawer

#### 2.4 Comments (included in MVP)
- Per-task comments: vendor and customer can discuss specific tasks
- Portal auto-sets comment author to contact name
- Comment model already exists in schema
- Deferred: general messages, @mentions, onboarding-level communication

#### 2.5 Customer notifications (deferred)
- Email notifications when: new tasks assigned, due date approaching, vendor sends a message
- Digest option: daily summary email instead of per-event
- Each notification includes a magic link back to the relevant task/page
- Unsubscribe option per contact

#### Implementation steps (7 shippable increments)

1. **Schema + DB functions** — MagicLink table, File model, assigneeContactId on Task, new `lib/db.js` functions
2. **Middleware + auth helper** — exempt `/portal` from Supabase auth, create `validatePortalToken()` helper
3. **Vendor magic link UI** — Generate/Copy/Revoke buttons on ContactsPanel, new API routes
4. **Portal layout + Progress Overview** — landing page with health, task summary, go-live countdown. Responsive PortalLayout.
5. **My Tasks + done toggle + file upload** — filtered task list, mark done, upload files. Portal API routes.
6. **Task detail + comments** — expandable task view, comment thread, add comment as portal contact.
7. **Polish + edge cases** — expired/revoked token UX, empty states, mobile responsiveness.

---

### Phase 3 — AI & automation (make it smart)

#### 3.1 AI follow-up drafts
- Button on blocked/overdue tasks: "Draft follow-up"
- AI generates a polite, contextual message using: task title, who it's waiting on, how long it's been, what's needed
- Vendor reviews, edits, and sends (via the tool or copies to email)
- Tone options: friendly nudge, firmer reminder, escalation to exec sponsor
- No auto-send — human always approves

#### 3.2 Smart nudges
- Automated suggestions: "This task has been blocked for 5 days — want to follow up?"
- Surface in the vendor's dashboard or via email digest
- Escalation suggestions: "Customer champion hasn't responded in 7 days — consider reaching out to exec sponsor"

#### 3.3 Predictive health
- ML-lite pattern matching: onboardings that look like past failures (same bottlenecks, same timing)
- "This onboarding is following a pattern similar to 3 others that churned — here's why"
- Risk factors: customer engagement dropping, task completion velocity slowing, key phases delayed

#### 3.4 Template suggestions
- After N onboardings: "These 5 tasks appear in every onboarding — want to save them as a template?"
- AI analyzes completed onboardings to suggest optimal task ordering and phase structure

---

### Phase 4 — Templates & scale (make it repeatable)

#### 4.1 Onboarding templates
- Create reusable templates: predefined phases, tasks, default owners, typical durations
- "Start new onboarding from template" — one click to scaffold
- Template library: multiple templates for different customer segments (Enterprise vs SMB, different products)
- Version templates: update the template without affecting active onboardings

#### 4.2 Reporting dashboard
- **Time-to-value**: average days from kickoff to go-live, trend over time
- **Bottleneck analysis**: which phases/tasks take longest, where do onboardings get stuck
- **Team workload**: how many active onboardings per team member
- **Customer engagement**: which customers are active vs. going dark
- **Completion rates**: % of onboardings completed on time vs. delayed vs. abandoned

#### 4.3 Integrations
- **Slack**: notifications, task updates, follow-up messages posted to a channel
- **Email**: send follow-ups directly from the tool (not just copy/paste)
- **CRM link**: associate onboarding with a CRM deal (Salesforce, HubSpot, Attio) — link field, not deep integration. Attio is a priority — it's the CRM our ICP actually uses.
- **Webhooks**: fire events on task completion, phase completion, health changes — let vendors build their own integrations
- **CSV import/export**: bulk create tasks, export onboarding data for reporting

#### 4.4 Sales-to-CS handoff
- Structured handoff form: deal size, customer requirements, key contacts, timeline expectations, special notes
- Sales fills this out when the deal closes → creates the onboarding automatically
- CS/Implementation team gets full context without a "handoff meeting" that covers things already written down
- **Linear import**: customers on trial often already have tickets/issues in Linear (bugs, setup tasks, feature requests). Pull these in during handoff so nothing falls through the cracks when moving from trial → paid onboarding.
- **Attio deal context**: pull deal metadata (size, stage, contacts, notes) from Attio directly into the handoff form — no manual re-entry for teams already using Attio as their CRM.

---

## Data model (expanded)

Current: Company → Onboarding → Task

Target:

```
Company
  ├── Contacts[]           — customer people (name, email, role)
  └── Onboardings[]
        ├── owner            — vendor team member responsible
        ├── targetGoLive     — target completion date
        ├── template         — which template it was created from (nullable)
        ├── Phases[]
        │     ├── name, order, targetDate
        │     └── Tasks[]
        │           ├── title, status, due, owner, waitingOn
        │           ├── assignee → Contact (nullable)
        │           ├── notes
        │           ├── Comments[]
        │           └── Files[]
        ├── Messages[]       — onboarding-level communication
        ├── ActivityLog[]    — audit trail of changes
        └── MagicLinks[]     — access tokens per contact

VendorTeam
  ├── members[]            — vendor users (Supabase Auth)
  └── Templates[]
        ├── phases[], tasks[]
        └── version
```

---

## Health scoring logic (detailed)

```
Health = f(blocked_tasks, overdue_tasks, customer_engagement, phase_progress)

Blocked (red):
  - All remaining tasks are blocked

At risk (amber):
  - Any task blocked > 3 days
  - Any task overdue
  - No customer activity in 5+ days
  - Phase behind schedule (< expected % complete by today)

On track (green):
  - No blocked tasks (or blocked < 24h)
  - All tasks within due dates
  - Customer active in last 3 days
  - Phase progress on or ahead of schedule

Completed (mint):
  - Onboarding status = Completed

Paused (grey):
  - Onboarding status = Paused

Dashboard shows reasons:
  "At risk — 2 tasks overdue, waiting on IT Admin for 6 days"
```

---

## Customer portal design principles

1. **No login** — magic link only. Every extra step loses customers.
2. **Desktop-first, fully responsive** — customers do onboarding work at their desk, but checking progress on mobile should feel great too. Designed for laptop, polished for phone.
3. **Clarity over features** — show what's next, what's done, what's blocked. Nothing else.
4. **Respect their time** — executive sponsors see a 3-line summary. Technical leads see task details. Don't show everyone everything.
5. **One-tap actions** — mark task done, upload a file, reply to a message. Minimal friction.
6. **Branded** — vendor can add their logo and colors. It should feel like *their* onboarding portal, not a third-party tool.

---

## Tech stack

- **Next.js** (App Router), JavaScript (no TypeScript for now)
- **Tailwind** for styling
- **Postgres** on **Supabase** (hosted, free tier, auth included)
- **Prisma** ORM — schema in `prisma/schema.prisma`, client in `lib/generated/prisma`, app layer in `lib/db.js`
- **Supabase Auth** — email/password now, magic link + OAuth later
- **Supabase Storage** — file uploads (when needed)
- **AI** — OpenAI API or Anthropic API for follow-up drafts (when needed)
- ESLint enabled

### Possible future migration: Supabase → SurrealDB

**Why consider it:**
- Supabase free tier pauses projects after 7 days of inactivity (annoying)
- SurrealDB Cloud free tier (1 GB storage, 0.25 vCPU) does not appear to pause for inactivity
- SurrealDB is a multi-model DB (document + graph + vector + relational in one) — ideal for Phase 3 AI features:
  - Native vector search for finding similar onboardings (no separate pgvector setup)
  - Native graph traversal for walking Company → Onboarding → Phase → Task → blocker chains
  - Combined vector + graph + relational queries in single SurrealQL statements
  - Built-in agent memory patterns for AI follow-up / insights features
- Supabase can do vector search (pgvector) but has no graph support — would need a separate DB for knowledge graphs

**Migration scope (assessed March 2026):**
- ~25-30 files to modify, moderate effort overall
- `lib/db.js` rewrite is the big one (~600 lines, 25 functions) — but since all DB access is centralized there, API routes and UI stay untouched
- Auth replacement (Supabase Auth → NextAuth.js or SurrealDB built-in auth) touches ~20 files
- Integer IDs → SurrealDB record IDs requires reworking validation logic
- No Prisma adapter for SurrealDB — use `surrealdb.js` SDK with raw SurrealQL
- Can be done incrementally: DB layer first, auth second

**Caveats:**
- SurrealDB Cloud is still in beta (DB engine is v3.0 GA, cloud is not)
- Younger ecosystem — fewer tutorials, community answers
- Alternative: self-host SurrealDB via Docker to avoid cloud limitations entirely

**Decision:** Park for now. Build app features on Supabase, migrate when AI agent work begins (Phase 3). The centralized `lib/db.js` pattern means migration is always contained.

---

## Key decisions (log)

*Full log with rationale: **`DECISIONS.md`**.*

- **Tailwind**: Keep Tailwind for styling.
- **Demo clients**: Acme Co = client 1 (onboarding id `1`), TechCorp = client 2 (onboarding id `2`).
- **Read DB**: Postgres + Prisma. App reads from DB only for now (no create/update/delete from UI yet). See `DATABASE_SETUP.md` for setup.
- **Supabase for Postgres**: Use Supabase as the Postgres host for this portfolio project — beginner-friendly, no local DB, free tier; when we add vendor auth later, Supabase Auth (magic link, OAuth) fits well.
- **Schema changes**: First tables (Company, Onboarding, Task) were created manually in Supabase (Prisma 7 `db push` doesn't apply in this setup). For future changes: use **Prisma Migrate** — edit `prisma/schema.prisma`, run `npx prisma migrate dev --name descriptive_name`; if CLI can't connect, use `--create-only` and run the generated SQL in Supabase SQL Editor. Baseline migration `20260201180000_init` is in place.

---

## Entities (for backend)

- **Company** (customer)
- **Onboarding** (per company)
- **Contact** (customer person: IT admin, Ops lead, etc.)
- **Phase** (stage within an onboarding: Kickoff, Configuration, etc.)
- **Task**: title, status, due date, owner, waitingOn, assignee, notes, attachments
  Optional later: task dependency ("blocked by").
- **Comment** (per-task discussion thread)
- **Message** (onboarding-level communication)
- **ActivityLog** (audit trail)
- **MagicLink** (customer portal access token per contact)
- **Template** (reusable onboarding playbook)

---

## AI feature (if built)

Button on blocked task: "Generate follow-up" → draft email/Slack using title, due date, who it's waiting on, what's needed. Human copies/sends. No auto-send.

Tone options: friendly nudge → firmer reminder → escalation to exec sponsor.

Smart nudges: proactive suggestions when tasks are stale, customers go dark, or patterns match past failures.

---

## Current scaffolding

- **`/`** — List of onboardings (company name, health, task count). Links to detail. Data from Postgres via `lib/db.js`.
- **`/onboardings/[id]`** — One onboarding: Kanban board with task cards by status. Data from Postgres.
- **`lib/db.js`** — Postgres read layer (Prisma): `getOnboardings`, `getOnboarding`, `getTasksForOnboarding`. `lib/health.js` has `computeHealth` (pure, no DB).
- **`prisma/schema.prisma`** — Models: Company, Onboarding, Task. Connection URL in `prisma.config.ts` (CLI) and `DATABASE_URL` at runtime.
- **`prisma/seed.js`** — Seeds 10 companies with 28 tasks. Run with `npx prisma db seed`.
- **`app/components/`** — StatusBadge, TaskCard, Sidebar, AppShell, Menu, OnboardingsActionBar.
- **`DATABASE_SETUP.md`** — How to set up Postgres and run push/seed.

---

## Build priority (what to do next)

1. **Task CRUD** — without this, the app is read-only. This is the blocker for everything else.
2. **Onboarding CRUD** — create new onboardings, not just view seeded ones.
3. **Contact model** — add customer people to onboardings.
4. **Phases** — break onboardings into stages with progress tracking.
5. **Customer portal + magic links** — the differentiator. Get this right.
6. **Communication** — comments and messages so conversation lives in the tool.
7. **AI follow-ups** — the "wow" feature for demos and pitch.
8. **Templates** — make it repeatable.
9. **Reporting** — prove value to VP/Head of CS buyers.
10. **Integrations** — Slack, email, CRM links.
