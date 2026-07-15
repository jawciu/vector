# Onboarding Orchestrator

B2B onboarding workflow tool. Next.js 16 app with Prisma ORM + Supabase (Postgres + Auth).

The user's name is Caroline and she calls the AI assistant "Cakes".

---

## Tech Stack

- **Next.js 16** (App Router) — JavaScript, no TypeScript
- **Tailwind CSS v4** — CSS-first config, no `tailwind.config.js`
- **Prisma 7** — ORM with `@prisma/adapter-pg`
- **Supabase** — Postgres host + Auth (email/password)
- **dnd-kit** — drag-and-drop on Kanban board
- **ESLint 9** — flat config in `eslint.config.mjs`

---

## Critical Rules

### Next.js
- **Always `await params`** before accessing properties in dynamic routes (Next.js 15+): `const { id } = await params`
- **Dev and build use `--webpack`** flag (not Turbopack) — PostCSS breaks with Turbopack. Scripts are already configured in `package.json`.
- **PostCSS config** must be CommonJS (`postcss.config.js` with `module.exports`), not ESM.

### Prisma
- After **any schema change**: run `npx prisma generate` and remind user to restart dev server.
- **Prisma 7 requires adapter**: `@prisma/adapter-pg` with `DATABASE_URL` passed explicitly when creating `PrismaClient`.
- **Migrations**: edit `prisma/schema.prisma` → run `npx prisma migrate dev --name descriptive_name`. If CLI can't connect, use `--create-only` and run the generated SQL in Supabase SQL Editor.
- **Seed**: `npm run seed` (runs `npx tsx prisma/seed.js`). Seed script loads `.env` with `dotenv/config`.
- **Two DB URLs**: `DATABASE_URL` (transaction pooler, port 6543) for the app; `DIRECT_DATABASE_URL` (session pooler, port 5432) for Prisma Migrate.

### Tailwind CSS v4
- **No `tailwind.config.js`** — uses `@import "tailwindcss"` in `globals.css` with `@theme` blocks for tokens.
- **NEVER add `* { padding: 0 }` or `* { margin: 0 }`** after the Tailwind import — Preflight already resets these, and duplicating them overrides ALL padding/margin utilities.
- See `.claude/skills/tailwind-css-v4/SKILL.md` for full v4 patterns.

### ESLint
- Flat config in `eslint.config.mjs`.
- Ignore generated files via `globalIgnores()` (not `.eslintignore`, deprecated in v9).
- Generated Prisma files live in `lib/generated/**`.

---

## Project Structure

```
app/
  api/                    # API route handlers (15 routes)
    tasks/                # CRUD, reorder, bulk, comments
    onboardings/          # CRUD, duplicate, contacts
    companies/            # Company lookup
    phases/               # Phase CRUD
    contacts/             # Contact CRUD
  auth/callback/          # Supabase auth callback
  onboardings/[id]/       # Onboarding detail (Kanban board)
  login/                  # Login page
  settings/               # Settings page
  components/             # Feature components (19 files)
  ui/                     # Design system primitives (6 files)
  globals.css             # Tailwind imports + theme tokens + component classes

lib/
  db.js                   # ALL database access (~600 lines, ~25 functions)
  health.js               # Health scoring (pure, no DB)
  supabase/
    server.js             # Server-side Supabase client (cookies-based)
    client.js             # Browser-side Supabase client
    proxy.js              # Session refresh middleware

prisma/
  schema.prisma           # 6 models: Company, Onboarding, Contact, Phase, Task, Comment
  seed.js                 # Seeds 10 companies with 28 tasks
  migrations/             # 10 migrations

proxy.js                  # Next.js middleware entry point (Supabase session)
```

---

## Database Layer

**All DB access is centralized in `lib/db.js`** — API routes and components never call Prisma directly. This is intentional and must be maintained.

### Models (6 tables)
- **Company** → has many Onboardings
- **Onboarding** → belongs to Company, has many Tasks, Contacts, Phases
- **Contact** → belongs to Onboarding
- **Phase** → belongs to Onboarding, has many Tasks
- **Task** → belongs to Onboarding + Phase, self-referential (blockedByTask), has many Comments
- **Comment** → belongs to Task

### Patterns
- `lib/db.js` validates IDs before Prisma calls: if `Number(id)` is `NaN`, return `null` or `[]` — never pass `NaN` to Prisma.
- All relationships use cascade deletes.
- All models use auto-incrementing integer IDs.
- RLS is enabled on all tables but only restricts PostgREST API access (Prisma bypasses it as postgres role). No RLS policies are defined.

---

## Auth

- **Supabase Auth** — email/password only (OAuth and magic links planned for later).
- **Two clients**: server (`lib/supabase/server.js` using `cookies()`) and browser (`lib/supabase/client.js`).
- **Session refresh**: `proxy.js` middleware calls `supabase.auth.getClaims()` to validate JWT and refresh tokens, redirects unauthenticated users to `/login`.
- Every API route handler calls `supabase.auth.getUser()` as an auth guard.
- Sign out lives in the sidebar user dropdown.

---

## UI / Design System

**Source of truth: [DESIGN.md](DESIGN.md)** at the project root. All tokens (colors, spacing, typography, rounded, shadows) and component rules (IconButton, Button, Menu primitives, hover patterns) live there.

### Build pipeline
- `DESIGN.md` is the canonical source. Edit tokens there.
- `app/theme.css` is autogenerated from DESIGN.md by `scripts/build-theme.js`. **Never edit theme.css by hand.**
- Run `npm run build:ds` to regenerate. `predev` and `prebuild` hooks run it automatically.
- Run `npm run lint:ds` to validate (contrast, broken token references, schema).
- `globals.css` imports `theme.css` for the token block, then defines component CSS (`.icon-btn`, `.btn-primary`, etc.).

### Component locations
- **`app/ui/`** — DS primitives: `Button`, `IconButton`, `CalendarDropdown`, `Icons`, `FieldPill`, `FieldRow`, `TabBar`, `Tooltip`.
- **`app/components/`** — Feature components: `TaskCard`, `Sidebar`, `Menu`, `TaskDrawer`, etc.

### Key conventions (full detail in DESIGN.md)
- **Read DESIGN.md before creating UI** — it covers tokens, component rules, do's and don'ts.
- All dropdowns/popovers MUST use `MenuList` + `MenuOption` from `app/components/Menu.js`.
- IconButton: always `w-5 h-5 rounded` + `.icon-btn`. `rounded-full` is for avatar circles only.
- DS primitives are added incrementally — only extract to `app/ui/` when explicitly asked.

---

## Security

- `.env` is gitignored (`.env*` pattern) and was never tracked.
- Env vars: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Key Reference Files

| File | Purpose |
|------|---------|
| `AI_PLAN.md` | **AI features implementation plan — current state + architecture + open work.** Read this first when picking up AI work. |
| `REALISM_PLAN.md` | Plan for growing demo data into a real-looking book of business (real companies + logos, lifecycle mix, meetings through the real pipeline). Planned 2026-07-09, not yet executed. |
| `EVALS_PLAN.md` | Plan for AI evals — golden dataset + deterministic replay, LLM-as-judge, EvalRun table + /admin/ai Evals tab (in-app, no external tool; Opik kept as escape hatch), GitHub Actions autonomous runs. Planned 2026-07-09, not yet executed. |
| `DESIGN.md` | **Design system source of truth** — tokens, components, do's and don'ts |
| `PLAN.md` | Product vision, feature phases, tech stack, build priority |
| `DECISIONS.md` | All major decisions with rationale |
| `DATABASE_SETUP.md` | Postgres + Prisma setup instructions |

---

## Workflow

- No evaluator agent — work solo (builder only).
- Run `npm run dev` (uses `next dev --webpack`).
- Run `npm run build` (uses `next build --webpack`).
- Lint with `npx eslint`.

## Testing

- **Unit tests: Vitest** — `npm test` (one-shot) or `npm run test:watch`. Config in `vitest.config.mjs`.
  - Unit tests are `*.test.js` colocated with the code (e.g. `lib/health.test.js`); config excludes `e2e/` so Vitest never picks up Playwright specs.
  - Tests that depend on "today" must freeze the clock with `vi.useFakeTimers()` + `vi.setSystemTime()`.
  - Good targets: pure logic in `lib/` (health scoring, AI match heuristics). Don't unit-test `lib/db.js` Prisma calls — e2e covers those.
  - Modules that import `@/lib/db` or the AI client must mock them (`vi.mock`) so tests run without a DB or API key — see `lib/integrations/miniti.test.js`. The `@/` alias is mirrored in `vitest.config.mjs`.
- **E2e tests: Playwright** — `npm run test:e2e`, specs are `e2e/*.spec.js`.
- **CI**: `.github/workflows/unit-tests.yml` runs `npm test` on every push to main and every PR. Unit tests only — e2e is not in CI (needs live DB + server). Actions pinned to `@v5` (v4 targeted deprecated Node). Runs are green; watch at github.com/jawciu/vector/actions.

---

## Decision Log

_Newest first. Why, not just what._

- **2026-07-15 — Mobile is blocked in the vendor app; the portal stays mobile-friendly.** The vendor UI is not responsive yet and Caroline doesn't want anyone seeing it broken, so `DesktopOnlyOverlay` (`app/components/DesktopOnlyOverlay.js`, rendered from `AppShell` on all vendor paths including `/login`) covers the viewport below 768px with a branded "Vector is built for desktop" screen — custom SVG (monitor + mini kanban + lilac vector-arrow in the **action ramp**; the AI gradient/sparkle stays reserved for AI surfaces), draw-in/float animations in `globals.css` (`.dg-*`, `prefers-reduced-motion` respected). Visibility is pure CSS (`md:hidden`, zIndex 10000) — no UA sniffing, desktop untouched, and a squished desktop window is blocked too (the layout is equally broken there). **The customer portal is deliberately excluded** (`AppShell` early-returns for `/portal`) — it was built mobile-first and customers open magic links on phones. No escape hatch by choice; add a "continue anyway" link if Caroline ever needs to demo from a phone.

- **2026-07-12 — Button emphasis is a three-tier ladder, and repeated rows get NO primary.** The AI draft inbox had a filled `btn-primary` on every row (`Create task` / `Comment` / `Approve`), so scrolling the page was a wall of purple. Researched the major design systems: **IBM Carbon** — *"Each page should have only one primary button… for data lists, low emphasis buttons (tertiary or ghost) may be a better choice"*; **Atlassian** — *"primary buttons should only appear once per area"*; Polaris and Material 3 agree. The logic that settled it: a filled button repeated N times conveys **zero** hierarchy (if every row shouts, no row is louder) *and* steals distinction from the page's real primary. So the inbox now has **zero primaries** — accept actions are `secondary`, everything else (`Dismiss` / `Edit task` / `Save draft` / `Open in mail`) is `tertiary`. **Merged `.btn-ghost` into `.btn-tertiary`** — Caroline correctly called out that two identical-looking low-emphasis classes is one too many. Tertiary = bare label, `textMuted` → `text` on hover, **never a background** (that's what made ghost look like a different component next to an inline Dismiss); the transparent 1px border only exists to height-match an adjacent secondary. Added `tertiary` to `app/ui/Button.js` and documented the whole ladder + the one-primary-per-section rule + 3 new Don'ts in DESIGN.md. **Also fixed `.btn-secondary`'s hover app-wide**: it went `--bg` (#18181E) → `--bg-hover` (#211F29), a ~3-point shift that is invisible when the button sits on an elevated card (#1D1C24). Hover is now `--surface-hover`, active is `--bg-hover`. **This changes every secondary button in the app** — worth an eye on other views.
- **2026-07-12 — `PendingAIChange.ownerId` is now a real foreign key, not a JSON field.** Root-cause fix for the merge bug below. `payload.ownerId` lived only inside the JSONB blob, which Postgres treats as opaque text — so the Maya→demo merge updated every relational column and left the JSON pointing at a deleted user. Because the follow-up visibility filter reads that field, every follow-up would have silently become invisible to everyone: no error, no warning. Migration `20260712170000_add_pendingaichange_owner_fk` adds `ownerId INTEGER` + FK to `VendorUser` **`ON DELETE SET NULL`** (an orphaned nudge should reach nobody rather than be mis-attributed to whoever inherits a recycled id), backfills from the JSON *only where the id resolves to a live VendorUser*, and indexes `(action, status, ownerId)`. The three readers in `lib/db.js` (`listPendingAIChanges`, `countPendingAIChanges`, `getPendingAIChangeCountsByOnboarding`) now filter **in Postgres** instead of loading every draft into JS — `getPendingAIChangeCountsByOnboarding` became a `groupBy`. That also fixed a latent bug: `listPendingAIChanges` applied `take: limit` *before* the owner filter, so a busy inbox could silently return fewer than the limit. Verified the new filters return byte-identical results to the old JSON ones for all 7 vendor users, and proved `ON DELETE SET NULL` fires by deleting a vendor inside a rolled-back transaction. **`payload.ownerId` is still written as a legacy mirror** (`createPendingAIChange` keeps the two in sync) — drop it once nothing parses it. **Schema-change gotcha: the shadow DB can't replay Supabase's `auth` schema, so `prisma migrate dev` fails (P3006) even with `--create-only`. Hand-write the migration SQL, apply it with `prisma db execute --url $DIRECT_DATABASE_URL`, then `prisma migrate resolve --applied <name>`. Note `.env` has a multi-line value, so `set -a; . ./.env` breaks — load it via `dotenv/config` in a Node script.**
- **2026-07-12 — `payload.taskId` investigated and deliberately left as JSON.** Same shape as the `ownerId` bug but **not** the same severity, so it was not changed. The approve route reads `targetId` from `draft.payload` (never from the client-supplied `overrides`) and then re-validates it against the live DB via `assertTaskBelongs`, which auto-rejects the draft if the task is gone and 400s if it belongs to another onboarding. So it **fails safe and loud**, where `ownerId` failed **silent and invisible** — that difference is the whole reason one was urgent and the other isn't. Audited the live data: of 52 drafts carrying a `payload.taskId`, **0** point at a deleted task and **0** cross onboarding boundaries. If it's ever promoted to a real FK it must be `ON DELETE SET NULL`, **not** `CASCADE` — cascade would delete applied/rejected drafts when their task is deleted and destroy the audit trail, whereas SetNull preserves history and still lands in the existing "task no longer exists → auto-reject" path.
- **2026-07-12 — The demo login IS Maya Lindqvist. VendorUser 4 was merged into VendorUser 8 (`demo@vector.test`).** Follow-ups are owner-scoped (`lib/db.js:2325-2330` — `draft_followup` rows are filtered to those whose `payload.ownerId` matches the logged-in vendor; **no other action type is filtered**). The public demo auto-logs in as `demo@vector.test` (`DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD`), which owned **zero onboardings and zero tasks** — so every owner-scoped surface rendered empty for it. That's the same root cause as the empty Notification Center. Rather than weaken the scoping (it's a real feature worth demoing) or assign tasks to Caroline's personal account (which wouldn't help a public demo visitor), **merged Maya into the demo user**: remapped `Onboarding.ownerId`, `Task.ownerId`, `ActivityLog.actorVendorId`, `Notification.recipientVendorId`, `PendingAIChange.resolvedBy` **and the JSON `payload.ownerId` on every `draft_followup`** from 4 → 8, then took Maya's name onto VendorUser 8 and deleted VendorUser 4. Chose Maya specifically because she already owned Raycast + Function Health and is the vendor lead in every Raycast meeting transcript — so zero fixture rewrites. The demo visitor now owns Raycast, Function Health and Peerspace, sees 6 of the 11 follow-ups, and *correctly* cannot see Theo's or Sam's — the scoping is visible as a feature rather than as an empty tab. **Gotcha for the future: `payload.ownerId` is JSON, so any vendor-user remap must patch it explicitly or follow-ups silently vanish.**
- **2026-07-12 — Stale-task follow-ups need an assigned customer *contact*, not just an owner.** The scanner sets `payload.to` from the task's `assigneeContact`, so a task with no contact produces a follow-up email addressed to nobody and a dead mailto link — 10 of the first 12 drafts had `to: null`. Fixed by assigning contacts to every stale (Blocked / ≥5-days-overdue) task across the active book using a role-aware heuristic (SSO/access/permissions → IT Administrator or Security Reviewer; dbt/metrics/semantic/CI → Analytics Engineer; dashboards/parity/training/go-live → Head of Data). **Existing drafts bake the recipient into their payload at creation time**, so the pending ones had to be discarded and the scan re-run — assigning contacts alone does not repair drafts that already exist.
- **2026-07-12 — One company = one onboarding, for the demo. Duplicate ChowNow + Ashby onboardings deleted.** The seed gave ChowNow and Ashby two onboardings each (a Completed one and an Active one) to show off multi-onboarding support. Two problems: (1) **`Onboarding` has no `name`/`label` field** — the `label:` key in `seed-portfolio-growth.js` specs is silently ignored — so both rows render as the same bare company name in the list, indistinguishable to a viewer; (2) the Miniti match heuristic can't disambiguate two onboardings for one company either, which is exactly why the two ChowNow meeting fixtures (`15-sync-chownow`, `16-golive-chownow`) landed as `matchAmbiguous` and never reached an onboarding. Deleted the **Completed** rows (#71 ChowNow, #73 Ashby); kept the Active ones, which carry the future go-lives and are what the ChowNow fixtures are written for. Chose delete over re-pointing them at new companies because task IDs are immutable and prefix-bound — #71's tasks are `CHO-1…CHO-23`, so re-companying would leave every task ID lying about its owner unless the immutable `number`/prefix were also rewritten. Cascade delete handled tasks/phases/contacts/activity. **If multi-onboarding-per-company is ever revived, `Onboarding` needs a name field first** — otherwise the UI and the matcher are both blind.
- **2026-07-12 — Raycast + beehiiv got meeting fixtures; Raycast's are the "gone dark" arc.** Fixtures 19–21 (Raycast) and 22–23 (beehiiv) in `prisma/fixtures/meetings/`. Raycast previously had **zero** meetings because it and beehiiv are the only two `stage: "fresh"` onboardings and the original 18 fixtures only covered `mid`/`near` accounts — but Raycast is first in the list, so it's the one a demo viewer clicks first. Its three meetings are dated 9/7/5 days ago and tell a deliberate story: kickoff → access stalls in security review → weekly sync where the customer says "we'll come back to you" and goes quiet. That *earns* the 7 blocked tasks, the red health, and the "no customer activity in the portal" insight instead of them appearing arbitrary. beehiiv is the contrast case (fast, competent customer; the one blocker is a real definitional dispute). All five matched by attendee **email domain**, so no ambiguity.
- **2026-07-12 — The stale-task scanner requires a task owner, so demo follow-ups need owners assigned.** `scanStaleTasks` (`lib/ai/scan-stale.js`) skips any stale task with `ownerId == null` — it needs someone to attribute the email to. Raycast had 7 blocked tasks but 2 were unowned, so a scan would have silently drafted only 5. Assigned RAY-10 and RAY-17 to Maya (Raycast's owner) before scanning. First unscoped run (`scopeVendorId: null`) drafted 11 follow-ups across Raycast (7), Function Health (2), Flock Freight (1), ChowNow (1). **Note the "Scan now" button on `/admin/ai` is scoped to the calling vendor's id**, so it will draft nothing for onboardings owned by the fictional vendor users — an unscoped run (the cron path) is what populates the demo.
- **2026-07-12 — Demo notifications are seeded by a script, not the demo snapshot.** The vendor Notification Center was empty for `demo@vector.test`, because `deriveNotifications` (`lib/db.js`) only fans out to a Notification row on **contact**-authored ActivityLog entries, addressed to the onboarding's `ownerId` — and the demo user owns zero onboardings. Fixed with `prisma/seed-demo-notifications.js` (`npm run seed:notifications`): plants 9 contact-authored events across Function Health / beehiiv / ChowNow / Loop Returns, addressed to the demo user (7 unread + 1 read group, one multi-event group that renders as "made 3 changes"). Three constraints baked into the script: (1) it **skips any `completed`/`status_changed` event whose task's current status doesn't already match**, so the activity feed can never contradict the Kanban board; (2) `commented` events also insert a real `Comment` row + bump `commentCount`, so the notification isn't a dead end when clicked; (3) it **deliberately avoids Raycast** — that account's AI insight says "no customer activity has been recorded in the portal", which is the entire point of its "gone dark" narrative. **Note: `scripts/demo-snapshot.js` does NOT model ActivityLog/Notification/Comment** (it captures Company/Onboarding/Phase/Contact/Task only), so notifications can't be blessed into `demo-snapshot.json` — the idempotent seeder *is* the durable artifact. Re-run it after any demo reset.
- **2026-07-12 — Customer portal desktop layout brought in line with the vendor board.** The portal was designed mobile-first and stretched badly at desktop width. Four changes: (1) "Your tasks" on Overview is now a wrapping row of fixed 264px cards (`.portal-task-grid` in `globals.css`, gap 8px, left-aligned) instead of one full-width card per row; (2) the All Tasks board columns are fixed `width/minWidth/maxWidth: 264` + 24px gutter, copied from `OnboardingDetailClient.js` — previously `minWidth: 240` with no cap, so a long title stretched its column and columns came out uneven; (3) `PortalTaskCard` titles clamp to 2 lines (`.portal-task-title`), same treatment as `TaskCardView.js`; (4) the full-width "N updates since you were last here" banner is **deleted** (`PortalUpdatesBanner.js`) and replaced by `PortalNotificationBell.js` in the header — same bell + badge + popover as the vendor `NotificationBell`, but fed by `/api/portal/activity` (the vendor bell's `/api/notifications` is vendor-auth-scoped and would 401 for a portal contact). Opening the popover marks activity seen. The header now carries the company logo left of "Welcome, {name}" (`getPortalOnboarding` gained `companyLogoUrl`); the old top-right company chip is gone — the customer knows who they are. **The 264px width and the 2-line clamp are both `@media (min-width: 768px)`-guarded** so the mobile portal renders byte-identically to before.
- **2026-07-11 — "On hold" is a single, mutually-exclusive status, not a multi-tag.** Considered `status` → `String[]` (any combo, e.g. In progress + Blocked) but chose to keep `status` a single string and add "On hold" as a 6th value (cold candy pink `--candy #ff9ee5`, distinct from the warm `--danger` used for Blocked). Reason: ~40 files read `.status`; multi-tag would touch health calc, filters, picker, seed/snapshot — too much blast radius for the value. Blocked still wins onboarding health. Wired via `TASK_STATUSES` in `lib/constants.js` so the picker, `lib/taskFilters.js`, and the AI draft inbox all inherit it.
- **2026-07-11 — Status/health badges standardised to the kanban card badge.** The card status badge (`TaskCardView.js`, `text-sm rounded-md`, padding 2/4, 0.5px border, ~23px) is the single reference. Overview pills (`InsightCard.js` `InsightStatusPill` + `RiskCard`) and the board-header pills (`OnboardingDetailClient.js`) were smaller/tighter; matched them to 14px / line-height 20px / weight 400, rendered `inline` so they share the 23px height. The header "N blocked" count was a direct flex child → flex blockified it to `display:block` (2px taller); a plain wrapper `<span>` lets it flow inline. The two board-header pills (health + blocked count) are **filled** (solid bg + `--text-dark` + transparent border) as high-level status indicators, matching the `Declining` InsightStatusPill treatment.
- **2026-07-10 — Demo card statuses diversified via targeted UPDATEs, never a reseed.** Reseeding destroys injected Miniti meetings + AI drafts (see `prisma/reset-demo-data.js` warning), so status changes were applied per-task then blessed into `prisma/fixtures/demo-snapshot.json` via `scripts/demo-snapshot.js --capture`. Raycast (#63) deliberately pushed to 30% blocked → red/Blocked health; beehiiv/Function Health/Flock Freight/ChowNow sit At risk; rest On track.
- **2026-07-10 — Drawer first-open animation fix.** `TaskDrawer` returned `null` before a task was selected, so the first click mounted the panel already `--open` → it appeared instead of sliding. Keep the `Drawer` shell mounted (closed, offscreen) when there's no task so the first open transitions from `translateX(100%)`.

---

## Session Log / Handoff

_Newest first._

### 2026-07-13 — `.btn-secondary` hover verified app-wide (the flagged risk from 2026-07-12 is CLEARED)

**Done:** swept every `.btn-secondary` usage in the app (25 usages across 15 files, plus the 6 `Button variant="secondary"` modal Cancels) and verified the new `--surface-hover` hover on each distinct surface it sits on, in the browser (Playwright against `localhost:3001`, logged in as the e2e user; portal checked via a live `portal_token` magic-link cookie for Raycast #63):

- **`--bg` #18181E surfaces** (dashboard `PortfolioInsightsHero` refresh, vendor `TaskDrawer` Mark as done / Draft follow-up, portal `PortalDrawer` Mark as done): hover is a clear, calm 14-point lift. ✅
- **`--bg-elevated` #1D1C24 modals** (`CreateTaskModal` Cancel; same `Button variant="secondary"` pattern serves MemberModal / CreateOnboardingModal / OnboardingActions / BulkActionBar): resting button is darker than the modal (pre-existing), hover now lifts *above* the modal surface. This is the surface the fix was designed for — the old hover was a ~4-point (invisible) shift here. ✅ improvement.
- **`--surface` #1F1E26 cards** (settings `TeamPanel` Remove rows): hover ends only ~7 points above the card, so it's the subtlest of the three, but visible, and the 1px border keeps the pill defined. Strictly more visible than the old hover (which stayed *darker* than the card). ✅
- The two board-header Sort/Filter secondaries on onboarding detail are `disabled` placeholders — `:hover:not(:disabled)` never fires. Not affected.
- Verified computed style settles at exactly `--surface-hover` `#26242F` (`:active` = `--bg-hover` still correct).

**Verdict: no regression anywhere; the change is a net improvement on modals and settings.** No code changed this session.

**Also:** restarted the dev server for the sweep (fresh Prisma client, per the 2026-07-12 note), then it was stopped after verification — **not currently running**; next `npm run dev` starts clean. Testing gotchas learned: headless Chromium doesn't repaint `:hover` into screenshots (verify via `getComputedStyle` + a forced inline `background-color: var(--surface-hover)` for pixels), and reading a hover colour needs a ~400ms+ wait or you capture the 150ms transition mid-flight. Querying the DB from a script: import `PrismaClient` from `lib/generated/prisma/client` (no extension), plain `.js` file, run with `npx tsx`, no top-level await.

### 2026-07-12 (evening) — Follow-ups + meetings demo data, ownerId FK, draft-inbox button hierarchy

**Done — three threads, all working, NOTHING COMMITTED (see below).**

1. **Demo data: follow-ups + meetings.** Diagnosed why Raycast's Actions tab was empty — the stale-task scanner had *never run* against the seeded data (only 2 `draft_followup` rows existed in the whole DB). Also found Raycast had **zero meetings**: it and beehiiv are the only `stage: "fresh"` onboardings and the original 18 fixtures only covered `mid`/`near` accounts.
   - Wrote **9 new meeting fixtures** (`prisma/fixtures/meetings/19`–`27`): Raycast ×3 (a deliberate "gone dark" arc — kickoff → access stalls in security review → customer says "we'll come back to you" and goes quiet, which *earns* its 7 blocked tasks + red health), beehiiv ×2 (the competent-customer contrast), Ashby ×2, Modal ×1, Huel ×1. All matched by attendee email domain.
   - **Deleted the duplicate ChowNow (#71) + Ashby (#73)** Completed onboardings. Root cause worth remembering: **`Onboarding` has no `name`/`label` field**, so two onboardings for one company render identically *and* the Miniti matcher can't disambiguate them — that's exactly why the 2 ChowNow meeting fixtures had been sitting unmatched. After the delete they assigned cleanly.
   - Assigned customer contacts to every stale task (role-aware: SSO→IT Admin, dbt→Analytics Engineer, dashboards→Head of Data), then **discarded + regenerated the pending follow-ups** — drafts bake their recipient in at creation time, so assigning contacts does not repair existing ones.
   - Ran the scanner unscoped → **11 follow-ups**, 0 failures. Re-captured `demo-snapshot.json`.
2. **`PendingAIChange.ownerId` promoted from JSON to a real FK** (migration `20260712170000_add_pendingaichange_owner_fk`, backfilled 12/12, `ON DELETE SET NULL`, indexed). Root-cause fix for a bug that nearly shipped silently — see the Decision Log entry. Also merged VendorUser 4 (Maya) into VendorUser 8 so **the public demo login IS Maya** and can actually see owner-scoped follow-ups.
3. **Draft-inbox button hierarchy** — zero primaries, `.btn-ghost` merged into `.btn-tertiary`, DESIGN.md updated. See Decision Log.

**State:** all working. ESLint clean, DS lint clean (0 errors / 0 warnings), 63/63 unit tests pass, `/ai-drafts` compiles and returns 200. Full integrity sweep green: 11 pending follow-ups (0 missing owner FK, 0 missing recipient, 0 column/JSON drift, 0 bad task refs), 42 meetings, 0 stuck events, exactly 2 intentionally-ambiguous events, 0 companies with >1 onboarding. Every active onboarding has meetings and a non-empty Actions tab.

**⚠️ Next agent, start here:**
- **All of this evening's work is committed and pushed** — Caroline committed as we went. `local HEAD == origin/main == d9b61e2`. The four commits: `3b68ed3` (demo data + notifications), `56acd59` (ownerId FK + query optimisation), `a47c3dc` (button styles + draft card), `d9b61e2` (button variants + DESIGN.md). Only this `CLAUDE.md` journal entry is uncommitted. **Caroline commits only when she explicitly says so — ask before committing it.**
- **`.btn-secondary`'s hover changed app-wide** (`--bg-hover` → `--surface-hover`) and is already on `main`. It was only reviewed on `/ai-drafts`. ~~**Eyeball other views**~~ → **DONE 2026-07-13, all clear** — see the 2026-07-13 session entry above.
- ~~**Restart the dev server**~~ → done 2026-07-13.
- Task-title colour in draft rows now rests at `--text-muted` and brightens on hover. If that reads too dim, `--text-secondary` is the middle step.

**Open intent / deferred (Caroline's calls, not oversights):**
- **`payload.taskId` deliberately left as JSON.** Same shape as the `ownerId` bug but it **fails safe and loud** (the approve route re-validates against the live DB and auto-rejects), and 0 of 52 drafts are dangling. If promoted: **`ON DELETE SET NULL`, never `CASCADE`** — cascade would delete applied/rejected drafts and destroy the audit trail.
- `payload.ownerId` still written as a legacy mirror; drop once nothing parses it.
- Regenerating drafts after a data change is accepted as manual — Caroline explicitly decided it's not worth engineering around.
- Standing: Linear (Phase 4) + Attio (Phase 5) blocked on Caroline providing API access; REALISM/EVALS plans in progress on their branches.

### 2026-07-12 — On hold status, drawer fix, demo diversification, badge polish
- **Done (work spanned 2026-07-10 → 07-11, session was interrupted mid-way):**
  - Added "On hold" task status (cold candy pink) — `constants.js`, `taskFilters.js`, `AIDraftInbox.js`, schema comment. Commit `e5648d9`.
  - Fixed the drawer first-open slide (`TaskDrawer.js` keeps the shell mounted). Commit `e5648d9`.
  - Diversified demo card statuses across the 10 active onboardings; re-captured `demo-snapshot.json`. Commit `775383d`.
  - Matched status/health badge proportions to the card badge (`InsightCard.js`, `OnboardingDetailClient.js`). Commit `a6ac31e`.
  - Filled the two board-header status pills. Commit `409c795`.
- **State:** all code working and pushed — local `HEAD == origin/main == 409c795`, CI green on every push. Verified the earlier interrupted session's CI workflow (`unit-tests.yml` + `@v5` bump) is committed and on origin — nothing was lost. **Only uncommitted change: this `CLAUDE.md` journal entry itself** (Caroline logged off before OK'ing a commit for it).
- **Next:** commit this `CLAUDE.md` journal update (nothing else pending). Cosmetic only: a hard reload (Cmd+Shift+R) on `localhost:3001` clears a stale dev-session DOM ghost of the old unfilled count pill (dev-only, not in the real render — confirmed against raw SSR HTML).
- **Open intent:** none stated this session. (Standing, from memory: Linear (Phase 4) + Attio (Phase 5) still blocked on Caroline providing API access; REALISM/EVALS plans in progress on their branches.)
