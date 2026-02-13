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

#### 1.4 Phases / milestones
- Break an onboarding into phases: Kickoff → Configuration → Data Migration → Training → Go-Live (customizable)
- Each phase has its own tasks
- Phase-level progress bar (X of Y tasks done)
- Phase completion triggers (all tasks done → phase auto-completes, or manual)
- Target dates per phase

#### 1.5 Health scoring v2
- Current: blocked → "At risk", all blocked → "Blocked", else "On track"
- Add: overdue tasks factor into health
- Add: days since last customer activity (stale = risk)
- Add: % of tasks completed vs. expected by this date (ahead / behind schedule)
- Health reasons shown on dashboard: "2 tasks overdue", "No customer activity in 5 days", "Blocked on IT Admin for SSO setup"

#### 1.6 Vendor auth + roles
- Vendor team members sign up / log in (Supabase Auth, email/password first, OAuth later)
- Roles: Admin (full access), Member (manage assigned onboardings), Viewer (read-only)
- Onboarding ownership — each onboarding has a primary owner on the vendor side

---

### Phase 2 — Customer portal (make it shared)

The customer-facing experience. This is the differentiator — if customers actually use the portal, the whole product works. If they ignore it, it's just another internal PM tool.

#### 2.1 Magic-link access
- Vendor sends a magic link to each customer contact
- Link opens the customer portal for that specific onboarding — no login, no account
- Token per contact: unique, expirable, revocable
- Vendor can resend / revoke links from the onboarding detail page

#### 2.2 Customer portal pages
- **Progress overview**: phases, progress bars, overall health, upcoming deadlines
- **My tasks**: tasks assigned to this contact, with ability to mark done, upload files, add comments
- **All tasks**: full task list (read-only for tasks not assigned to them)
- **Timeline**: activity feed — what happened, what changed, messages from vendor
- **Files**: all uploaded files in one place

#### 2.3 File uploads
- Customers can upload files against specific tasks (e.g., "Upload your SSO metadata XML")
- File types: documents, images, CSVs, configuration files
- Files stored in Supabase Storage (or S3)
- Vendor can download / review files from the onboarding detail

#### 2.4 Comments & messages
- Per-task comments: vendor and customer can discuss specific tasks
- General messages: free-form communication on the onboarding timeline
- @mention contacts to notify them
- All communication in one place — no more digging through email threads

#### 2.5 Customer notifications
- Email notifications when: new tasks assigned, due date approaching, vendor sends a message
- Digest option: daily summary email instead of per-event
- Each notification includes a magic link back to the relevant task/page
- Unsubscribe option per contact

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
- **CRM link**: associate onboarding with a CRM deal (Salesforce, HubSpot) — link field, not deep integration
- **Webhooks**: fire events on task completion, phase completion, health changes — let vendors build their own integrations
- **CSV import/export**: bulk create tasks, export onboarding data for reporting

#### 4.4 Sales-to-CS handoff
- Structured handoff form: deal size, customer requirements, key contacts, timeline expectations, special notes
- Sales fills this out when the deal closes → creates the onboarding automatically
- CS/Implementation team gets full context without a "handoff meeting" that covers things already written down

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
2. **Mobile-first** — customers check status on their phone between meetings.
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
