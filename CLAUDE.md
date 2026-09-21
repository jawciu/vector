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
- **Any change to a DS primitive updates its meta, stories, JSDoc, DESIGN.md and every MDX/meta
  that cross-references it, in the same change** (grep for the name). Full checklist in
  `skills/design-system/SKILL.md`. Removing a component means the same sweep.

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

- **2026-09-11 — Rollout is STAGED, one component per PR; Phase 8 folded into Phase 7 as slices.** Caroline: "focus on a few components and take those to all the stages, so when we push to main I review a few components in production instead of freaking out about the whole app." Two facts make it safe: nothing in `app/ui` is user-visible until a screen imports it (Storybook does not ship with the app), and Vercel previews every PR, so she reviews one component across the app on the preview before merge. Slice order in `docs/DS-PLAN.md` Phase 7: 0 foundation merge (only visible change = the Phase 2 margin fix) → Button → Badge → Popover/keyboard/Select (sub-sliced, keyboard layer first) → Modal + form fields → pill clear → icons → inline-style sweep → keyboard walk. Phase 9 interleaves, ideally right after slice 0. **Ratchet baseline refreshed 2026-09-11 in the slice 0 PR (her go-ahead for slice 0 = the refresh).**
- **2026-09-11 — Select (custom, never native) is the value picker; Menu is action menus only.** From a 37-surface survey: two trigger looks (inline drawer rows, bordered modal boxes) over one list, plus Members = searchable multi-select the docs never covered. Model matches Radix / React Aria / Ariakit / Polaris / Carbon: `Select` with `trigger="inline"|"boxed"`, `multiple`, `searchable`, on a shared Popover with a full keyboard model; FieldRow/FieldPill become its triggers; MenuList/MenuOption/MenuTriggerButton become internals with deprecated aliases. Name "Select" is free since the native wrapper was deleted, fenced by the raw-`<select>` lint and a Menu-vs-Select chooser doc. Four open questions for Caroline are in the plan (filter pills, active→open/selected rename, Field wrapping Select, AI-inbox disabled pills).
- **2026-09-11 — Badge is the only status pill: 8-colour union (+mint/sky/candy), `status` prop owns the task-status mapping, `variant` filled|outlined replaces the `filled` boolean, outlined has md 14px / sm 12px.** Measured, not assumed: the board-header health pill she called "bold" is 14px/400 (the dark-on-bright fill reads heavier); the only 500-weight pill was the insight one. Filled = header pill exactly; she confirmed 400/14. Dead `StatusBadge.js` deleted (zero importers). The seven hand-rolled pill sites are slice 2.
- **2026-09-11 — FieldPill/FieldRow: native `<button>` inside a non-interactive wrapper, inline clear X.** Her ask was the drawer's clear-on-hover pattern; the first cut nested a button inside `role="button"` (axe serious) and reserved width. Final: wrapper div + `.field-main` native button + sibling Clear button shown on hover/focus-within/open, field grows to fit (matches the app). Closes peer-review item 12 for these two.

- **2026-09-11 — Select removed from the DS; keyboard operability is a hard requirement for the whole tool.** Caroline's Storybook review: "we should never have a system-native dropdown in the design system". The Select primitive had been built from the one hand-rolled native `<select>` in the app (Status, onboarding edit form) and the peer review had praised keeping the native popup for free keyboard/screen-reader behaviour; her rule wins. Select.tsx/meta/stories deleted, Field wraps TextField + Textarea only, dropdowns are always Menu. The Status field is a Phase 7 retrofit onto Menu. Consequence she called out herself: Menu's keyboard model (deferred in Phase 5) is now mandatory and lands before that retrofit, and every screen must be keyboard-operable by the Phase 8 exit. Plan updated in `docs/DS-PLAN.md` (+ plain-English twin).
- **2026-09-11 — Button: `text` variant deprecated, tertiary gains `tone="danger"`.** Caroline: text and tertiary were one too many; the lilac text button survives only as deprecated until Phase 7 retrofits its 6 raw `.text-btn` call sites (ContactsPanel ×3 incl. the red Revoke, PortalDrawer upload, ActionsTab + MeetingsTab "Clear"). `tone` is now a compile error outside tertiary/text (peer-review item 9 closed); `disabled`/`loading`/`children` exposed as Storybook controls (inherited DOM props are skipped by docgen, so they must be declared).

- **2026-09-10 — Phase 9 gains an agent-navigation package (intent + pairsWith on DsMeta, generated `app/ui/INDEX.md`, `metaCoverage` ratchet metric, two-questions doctrine + refusal format in the skills).** Caroline reviewed a talk on design systems built for LLMs and asked for its useful ideas folded in. The diagnosis it makes is real for us: an agent facing a flat `app/ui` folder reads everything and still picks by name; the cure is letting it narrow BEFORE reading (intent category → index → one meta file). Most of the talk's other ideas we already have (DsMeta = its per-component doc block, `status` = its published flag, ESLint + ratchet + CI = its mechanical review) or deliberately rejected: no atomic-level axis (25 primitives, all atoms/molecules — no discriminating power), no per-component changelogs (git + DS-LOG already; ceremony for one designer), no agent fleet gating every commit (wrong scale/cost), no per-component health dashboard (the scorecard is the dashboard). Our index is GENERATED from the meta files, which is stronger than the talk's hand-maintained one — that is the same drift class Phase 9 already kills for the style-right skill. Full spec in `docs/DS-PLAN.md` Phase 9 (+ the plain-English twin). **Her rule: the talk and its product are NOT to be named anywhere in the repo.** Still gated behind her Storybook re-review like the rest of Phase 9.

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

### 2026-09-21 — Nightly demo job: earlier schedule, AI overviews warmed, clamp churn fixed
- Caroline approved the 09-15 proposal ("go on do it"). Branch `feat/demo-warm-insights`.
- **Schedule:** `demo-drift-check.yml` cron `0 3 * * *` → `17 5 * * *` (06:17 UK summer). Odd minute on
  purpose: at the top of the hour GitHub fired it 07:52–08:40 UTC all week.
- **Warm step** (new, after restore + drift check, `continue-on-error`): `npx tsx scripts/demo-warm-insights.js
  --write`. Same snapshot builders + hashes as the pages, same request via new
  `buildInsightRequest()` in `lib/ai/insights.js` (the streaming route now uses it too), same
  `saveInsight` + `logAICall`. Warms portfolio/all + every seeded onboarding; NOT the portal insight
  (needs a contact session). Dry-run by default; skips scopes already fresh; skips itself with no
  ANTHROPIC_API_KEY. **Must run under tsx as a .js file**: a .mjs/.mts importer makes tsx mis-load
  lib/*.js as CJS ("does not provide an export named").
  First real run today: 12 generated, $0.16, 40s wall clock at concurrency 3. Verified in the browser:
  Raycast overview rendered with ZERO requests to /api/insights (page hash == script hash); one manual
  regenerate on Patch proved the refactored streaming route (200, streamed, re-rendered).
  Panel behaviour worth knowing: a cache older than the 4h soft TTL is still SHOWN instantly and
  refreshed in the background; only a MISSING cache shows the empty "Generating…" card. So one warm-up
  a day is enough to never show an empty overview.
- **Repo secret added:** `ANTHROPIC_API_KEY` (piped from local .env, never printed). Workflow triggers are
  schedule + dispatch only; no workflow uses pull_request_target. Suggest to Caroline: a separate key
  with a spend cap for CI.
- **Clamp churn fixed:** SQL clamps used the DB's now(); the snapshot did not clamp at all, so 6 applied
  drafts + 3 onboardings (FN, PEER, RAY) were "reset" every night. Now ONE clock: `{{now}}` param in the
  SQL and the same value into `shiftSnapshot(..., now)`. Pair dry run with `--delta=1` (new flag on
  `scripts/demo-pair-dryrun.mjs`, for days the job already ran): restore plan after shift = 0 ops.
- Still open: Monday's Vercel scan-stale follow-ups on seeded companies are deleted by the next restore
  (by design of "not in the baseline"); decide whether the scanner should skip seeded companies.

### 2026-09-15 — Nightly demo reset: second bug fixed, pair proven in a rolled-back dry run, re-enabled
- Caroline is sharing the live app publicly now, so visitors will change demo data and the nightly restore
  is required again. Her instruction: double-check everything, fix what needs fixing, then put it back.
- **Bug 2 (the magic-link revocations, confirmed):** the shift used `LEAST(col + interval, now())` on SIX
  nullable columns. Postgres LEAST ignores NULL, so every NULL became now(): Notification.readAt/archivedAt
  (all unread → read+archived), MagicLink.lastUsedAt/revokedAt (every live link revoked), ExternalEvent
  .processedAt (ambiguous events → "processed"), PendingAIChange.resolvedAt (pending drafts stamped
  resolved). Explains the 12:13 (09-13) and 08:38/09:38 (09-14) stamps. Fixed with a `keep()` helper
  (`CASE WHEN col IS NULL THEN NULL ELSE LEAST(...) END`); test counts guarded vs bare LEAST per column.
- **Definitive dry run of the pair** (`.playwright-mcp/pair-dryrun.mjs`, gitignored; run with
  `node --import ./.playwright-mcp/resolve-hook.mjs`, the hook lets plain node import the extensionless
  generated-client path): applies the shift SQL inside a Prisma interactive transaction, reads the shifted
  live state in the same tx, runs the REAL `planRestoreState` against `shiftSnapshot(json)`, compares
  null-column counts before/after, then throws to roll back. Result: null columns unchanged; restore plan
  after the shift == the plan without the shift (only real visitor drift since capture). Rollback verified.
- Runtime note: `demo-date-shift.mjs` runs under plain `node`, `demo-snapshot.js` under `tsx`; the two
  cannot share a runner without the resolve hook (tsx mis-loads `lib/health.js` as CJS).
- The nightly shift deletes all cached Insights, so the first visitor to each overview each day waits a few
  seconds for regeneration (12 onboardings + portfolio, Sonnet). Accepted for now.
- **Merged as PR #18 (7dba59f). `demo-drift-check.yml` RE-ENABLED** (cron 03:00 UTC daily; GitHub has been
  firing it late, ~08:35 UTC). Harness is now `scripts/demo-pair-dryrun.mjs` + `scripts/node-resolve-ts.mjs`:
  run it before any future change to either demo script. First real nightly run to check: 2026-09-16.
- **Status check 2026-09-21:** six scheduled runs 09-16 → 09-21, all green, fired 07:52–08:40 UTC (never
  at 03:00). Logs read, not just conclusions: shift delta 1–2 days, restore applied 9–21 ops, drift check
  "structurally intact" every night. Live counts identical to the 09-14 baseline (313 tasks, 130 drafts /
  71 pending, 63 comments, 251 activity, 16 notifications), 0 pending drafts with a resolvedAt stamp, Priya's
  link usable. Two benign things seen: (a) every night the restore "resets" the same 6 applied drafts
  (applied → applied) + 3 onboardings' lastActivity (FN, PEER, RAY): the shift clamps live
  resolvedAt/updatedAt to now() but shiftSnapshot does not clamp, so they disagree by a few hours and the
  restore writes the snapshot value back. Cosmetic churn, no data effect; fix = clamp in shiftSnapshot too.
  (b) Monday's Vercel scan-stale cron (08:00 UTC) created a follow-up that the restore deleted 40 min later
  as "created after the baseline": on seeded companies the weekly scanner's output never survives a night.
- **NOT built (proposed 09-15, no go-ahead):** move the cron to an odd minute ~05:17 UTC, and add an
  insight WARM step to the same workflow (script calling the generator, not a browser agent; ~13 Sonnet
  calls/day). Open question first: can lib/ai/insights.js generate outside the streaming route.
- Env gotcha: cmux injects `NODE_OPTIONS=--require=<tmp>/cmux-claude-node-options/restore-node-options.cjs`;
  after a long idle the tmp file is gone and every `node`/`npx` dies with MODULE_NOT_FOUND. Workaround:
  `export NODE_OPTIONS="--max-old-space-size=4096"` in the command; real fix is restarting the cmux session.

### 2026-09-13 — Meeting drawer trims + filled health pill (branch `feat/drawer-trims-filled-health`)
- Caroline reviewed the drawer against screenshots and asked for four cuts, all in `MeetingDrawer.js`:
  the "Open in Meetings tab" link under the attendees is gone (the drawer opens from the Meetings tab,
  so it was a link to where you already are); the tentative/firm badge on action items is gone
  (firmness stays in the data, it just is not shown); draft rows show the draft's kind as an icon
  instead of a "task" Badge; the transcript is open by default with a Hide toggle.
- The icon is the inbox's own `ActionIcon` (create task = the not-done circle-check, due date =
  calendar, etc.), moved out of `AIDraftInbox.js` into **`app/components/DraftActionIcon.js`** so both
  surfaces share one glyph per draft kind. It had to move: the inbox mounts the drawer, so importing
  from the inbox would have made a cycle. `.mtg-draft-kind` (20px, `--text-muted`) in globals.css.
- Verified: ESLint 0 errors, 110/110 vitest, rendered on Raycast (#63) weekly sync at 1440px.
- **Also: the AI overview header's health pill is now FILLED** (`InsightsPanel.js`, one prop), so it
  matches the filled trend pill beside it. This reverses the "health is ALWAYS outlined" rule that
  was documented in Badge.tsx / Badge.meta.ts / Badge.stories.tsx / DESIGN.md; all four rewritten to
  the new rule: health outlined where it stands alone (list, board header), filled in the AI header
  where the trend's arrow is what tells the two apart. Caroline's call. Badge's types already allowed
  `health` + `variant="filled"`, so no primitive change.
- **Open intent (Caroline):** re-evaluate the filled-vs-outlined health split later. The list and
  board header stay outlined for now on her say-so; the question is whether every surface should
  agree, and which way. `TODO(caro)` at the call site in `InsightsPanel.js`.
- **Both merged on Caroline's instruction:** this work as PR #14 (merge 9d0dbc4). Then the approve
  TOAST work from earlier today, which was sitting unmerged on `fix/approved-task-visibility` after
  PR #9 (commits 6aaa853 approve toast + View link, 9731bc0 `app/ui/Toast.tsx` primitive), merged as
  PR #15 (merge 86870ea) after merging main in (globals.css conflict: toast block vs drawer block,
  both kept). Remote branches deleted; the `onboarding-drafts` worktree still sits on its old local
  branch; `onboarding-meeting` is fast-forwarded to main.
- **Beehiiv findings (questions, nothing changed):** (1) a portal task completion DID create
  notifications (ids 69, 70) but `deriveNotifications` routes contact events to the onboarding's
  OWNER only, and beehiiv's owner is Sam (vendor user 7), not Maya (8); earlier beehiiv rows went to
  Maya, so the owner changed today. (2) There is no vendor-side toast on incoming notifications; the
  realtime commit ed2410b explicitly left it "for polish". (3) Nightly `demo-drift-check.yml` at
  03:00 UTC runs `demo-snapshot.js --restore-state --write` on every company with a logoUrl
  (beehiiv included): task statuses go back to the snapshot, visitor-added activity/notifications
  are deleted, approved drafts return to pending and their created tasks are deleted.
- **Manual restore run at 18:14 UTC** (workflow_dispatch of demo-drift-check, run 34773991165): 49
  changes applied, portfolio intact. Beehiiv back to snapshot (BEE-16/22 un-done, BEE-24/25 removed,
  drafts pending again).
- **Handoff / open, Caroline's calls (she signed off 18:20 UTC):**
  - Beehiiv's owner is Sam (vendor user 7) IN THE SNAPSHOT (taken 12:57 today), so Maya never gets
    Beehiiv portal notifications and every restore keeps it that way. If she wants Maya to see them:
    change owner, re-capture (`node scripts/demo-snapshot.js --capture`), commit the JSON.
  - Raycast reads At risk, not Blocked: 6 of 24 tasks blocked = 25%, threshold is 30%
    (`lib/health.js`). Options given: lower threshold, block 2 more RAY tasks in the snapshot, or a
    dependency-aware signal. She has not decided.
  - Vendor-side toast on incoming notifications still unbuilt (left "for polish" in ed2410b); the
    Toast primitive now exists on main, so it is a small job if wanted.
  - Worktree hygiene: `onboarding-drafts` still on the deleted-remote branch
    `fix/approved-task-visibility`; `onboarding-meeting` is on `feat/drawer-trims-filled-health`
    (also deleted remotely) but fast-forwarded to main. Neither has uncommitted work except this
    journal file.

### 2026-09-14 — Nightly demo reset had never actually run; fixed before the talk
- Caroline found Priya's Raycast tasks missing from the portal's start view. Cause: the nightly
  `demo-drift-check.yml` run (fired 08:35 UTC) FAILED at step 1, the date shift, before reaching the
  restore, so her evening practice (RAY-13/14/15/21/22 completed, six drafts approved) stuck. The
  portal's default Active filter hides Done, hence "missing".
- Root cause of the failure: CI runs `npx prisma generate` (Prisma 7.4), which now emits the generated
  client's imports WITHOUT file extensions (`./enums`), and the shift step runs the script with plain
  `node`, whose native TypeScript loader needs explicit extensions. The committed client (generated in
  July) has `.ts` extensions, which is why it works locally. Yesterday's 18:14 manual run only passed
  because the shift was a no-op (delta 0) and never imported Prisma. The restore step survives because
  it runs through `tsx`. Reproduced locally: regenerate without the option → `./enums`; with it → `./enums.ts`.
- Fix: `importFileExtension = "ts"` on the generator block in `prisma/schema.prisma`, regenerated
  (only the inline schema string in `internal/class.ts` changed). Plain-node dry run of the shift now
  passes locally.
- Restored the demo by hand first (`npx tsx --env-file=.env scripts/demo-snapshot.js --restore-state
  --write`): 5 RAY statuses back, 6 RAY tasks from approvals deleted, drafts pending again.

**⚠️ INCIDENT, same morning: the demo's AI drafts, comments, activity, notifications and file were
WIPED by a live workflow run I dispatched to "prove" the import fix (run 34828953151, ~09:40 UTC).**
- Second, masked bug: `shiftSnapshot` in `scripts/demo-date-shift.mjs` shifted every child row's
  `createdAt` in the snapshot but NOT its `key`, which embeds iso(createdAt). After the first real
  shift (+1 day), restore-state matched none of the 184 drafts / 296 activity / 63 comments /
  26 notifications / 1 file and deleted them all. Tasks, phases, contacts, onboardings, events survived.
  No Supabase backup existed. Caroline: "you know you always need to dry run are you crazy".
- **Rebuilt** (script kept at `.playwright-mcp/rebuild.mjs`, gitignored; dry-run = same code in a
  rolled-back transaction): 120/120 meeting drafts re-materialised from `ExternalEvent.orchestratorOutput`
  with statuses/dates/appliedTaskId from the snapshot; 63/63 comments verbatim; 280/296 activity rows
  (16 pointed at task ids that no longer exist) with reconstructed metadata; 26/26 notifications matched
  by timestamp (snapshot keys carried pre-shift buckets). Recipients = current onboarding owner.
  The 64 historical follow-up drafts were UNRECOVERABLE (snapshot stores no payload): ran the scanner
  via the cron route instead → 10 fresh follow-ups (RAY 6, FN 2, FLK 1, CHOW 1). The one File row is gone.
- Re-captured the snapshot from the rebuilt DB (restore-state dry run: "Nothing to put back").
- Fix + test for the key bug in this branch (`fix/demo-shift-keys`). **`demo-drift-check.yml` is
  DISABLED (`gh workflow disable`) and must stay disabled until Caroline says otherwise.** Re-enable only
  after a dry run of shift+restore against a capture: `node scripts/demo-date-shift.mjs` (no --write)
  then `npx tsx scripts/demo-snapshot.js --restore-state` (no --write) and read both plans.
- Rule now in her global CLAUDE.md + auto-memory: ALWAYS dry-run before writing to live data; never
  dispatch a live workflow to prove a fix.
- **After the rebuild, three more fixes (all dry-run first):** (1) every Raycast magic link had
  `revokedAt`/`lastUsedAt` stamped 2026-09-14T08:38Z, incl. three that were unrevoked in the snapshot;
  restored those three (Priya 6e9ab3d4, Marta a3fc3ac1, Felix 6fa479e5). Cause unproven; the shift's
  MagicLink SQL (`LEAST(x + iv, now())` on nullable columns?) is the suspect, check before re-enabling.
  (2) 29 `completed` activity rows whose task is NOT Done (Caroline's 09-13 practice as Priya/Felix,
  captured into the baseline before the restore reset the statuses) + their 10 notifications deleted;
  they made the Raycast AI summary say "exceptional week, 20+ tasks completed". Now it says 9 days in,
  6 blocked, BigQuery blocker cascading, no customer login. Snapshot re-captured again. (3) The shift
  had deleted all 42 cached insights; warmed all 12 onboarding overviews + the portfolio hero by loading
  them (each generated in 4–11s). The Raycast PORTAL insight is deliberately NOT warmed: logging in as
  Priya would write link_activated + lastSeenPortalAt and change the "no customer login" story.
- Global `/ai-drafts` shows only unmatched meetings by design; per-onboarding drafts are on each
  onboarding's Actions tab. Verified rendering of Raycast Actions tab + follow-ups on current main.

_Newest first._

### 2026-09-11 (night) — HANDOFF. Slice 0 MERGED (PR #3). Slice 1 built + evaluator-approved, UNCOMMITTED in a worktree.

**Where things are**
- `main` = `d916f0b` (PR #3 merge). The DS layer is in production, unused by screens; only visible change was the Phase 2 margin fix (14 spots listed on the PR). Caroline merged it herself.
- **Slice 1 (Button retrofit) lives in worktree `~/Code/onboarding-button`, branch `retrofit/button`, UNCOMMITTED, evaluator-signed-off after two rounds.** Numbers: raw buttons 86→46, primitive 55→95, coverage 39→67.4%, lint warnings 187→101, tsc/eslint/vitest 67/build/e2e 5/5 all green, ratchet baseline refreshed in the worktree. Screenshots + `after-styles.json` in the session scratchpad (gone next session; re-capture if needed).
  **Next step is hers: "commit" → commit on `retrofit/button`, push, `gh pr create --base main` with the lilac→grey list in the body:** members panel (ContactsPanel: Copy + Send go tertiary grey, Revoke stays red, all three +2px border), customer portal drawer (PortalDrawer: Upload goes grey); ActionsTab + MeetingsTab Clear gain only a hover step. Then she reviews the Vercel preview and merges.
- This checkout (`~/Code/onboarding`, branch `design-system`) is 0 ahead of main; ONLY this CLAUDE.md is modified (journal). Storybook was started from the agent's shell on :6006 and will die with the session; restart with `npm run storybook`.
- Skip `storybook-static/` when linting locally (`--ignore-pattern 'storybook-static/**'`); it is gitignored build output full of lint errors CI never sees.

**Decisions she still owes (none block the slice 1 PR)**
1. Members table "Send": now tertiary grey it reads as a label, not a link (the column's only coloured affordance). Accept, or give tertiary an `action` tone for inline links.
2. "Mark all read" (NotificationBell.js:264) and "+ Add section" (StuckEventsList.js:156 / FollowUpModal.js:372 area): convert to tertiary xs now (recommended) or leave for the sweep.
3. Tab-style buttons (4 segmented controls): add a small TabBar slice after Badge (recommended); no slice owns them today.
4. IconButton sizes: 4 app icon buttons are 24/24/28/16px vs the fixed 20px primitive (TaskDrawer toolbar, OnboardingActions close, FollowUpModal close, AIDraftInbox row). Add a size scale, or normalise the modal closes to 20 (recommended) and give the toolbar its own size. Also: IconButton stories draw a 12px placeholder glyph; the app's registry icons are 14px, so Storybook looks airier than prod. Fix the stories to use real Icons.tsx glyphs.
5. The four Select questions (docs/DS-PLAN.md slice 3): filter pills as a third trigger · rename active→open/selected first · Field wrapping a Select · AI-inbox disabled pills as disabled Select vs Badge.
6. Filled Badge: she confirmed 14px/400 (the header pill was never bold; the insight pill was the 500 one).

**Agent rule added 2026-09-12 (incident):** an evaluator agent walking the app on a local dev server (which points at the REAL Supabase demo DB via `.env`) accidentally marked RAY-7..RAY-10 done while scripting, then reverted them. Board verified back to seed; nothing lost. Caroline's ruling (2026-09-12): agents MAY click around the demo data (ticks, statuses, pickers); `scripts/demo-snapshot.js` drift-checks and restores the board. Still off limits unless the task is about that flow: delete/revoke, uploads, sending anything. Run the snapshot restore after a session that changed state.
**How this session worked (keep doing it):** builder agent (fork, full context) + independent evaluator agent (fresh Opus) per task; evaluator screenshots from Storybook via standalone Playwright from the repo root, measures instead of eyeballing, reports must-fix vs her-call; builder gets sent back with the numbered list. Never restart her Storybook mid-review; never edit .storybook/main.ts without telling her (needs a restart). Builders never commit. Retrofit slices run in a separate worktree so her checkout is untouched.

**Her last message was garbled (voice capture); "onboarding follow up" may mean the FollowUpModal or a follow-up on onboarding. Ask.**

### 2026-08-08 — Agent-first DS: plan adopted + Phase 0 (baseline audit) done. UNCOMMITTED.

**⚠ ALL DS WORK LIVES ON BRANCH `design-system` (created 2026-08-09, off main).** Caroline's call:
she's mid job-hunt and Vercel deploys main, so nothing DS-related touches main until she merges.
Also verified 2026-08-09: the `* { margin: 0 }` reset is from the Create-Next-App initial commit
(`c2b3bd5`, 27 Jan), NOT from her onboardings-table edge-to-edge work; exactly **15 margin-utility
usages** in 12 files are currently dead and will activate when Phase 2 layers the reset (list via
`grep -rE '\b(m|mt|mb|ml|mr|mx|my)-[0-9]' app`) — each needs a before/after eyeball, and the fix
does NOT resurrect browser default margins (the reset stays, just inside `@layer base`).

**The big picture:** Caroline approved a 10-phase plan to rebuild Vector's design system as an
agent-first DS with Storybook — a portfolio centrepiece AND her learning vehicle for founding-designer
roles. **`docs/DS-PLAN.md` is the plan of record** (Part A: reusable 7-lens audit playbook; Part B:
phases 0–10). **`docs/DS-PLAN-SIMPLE.md` is the same plan in plain English, heading-for-heading** —
keep BOTH in sync whenever the plan changes, she reads them side by side. Her binding decisions:
TS in `app/ui/` only · self-hosted VRT (Playwright + Vercel-hosted Storybook, no Chromatic) ·
retrofit in two stages (targeted, then full sweep — the sweep was her addition) · coverage metrics
always show count + ratio together, never % alone.

**Phase 0 shipped (all uncommitted, awaiting her OK):**
- `scripts/audit-ds.mjs` — zero-dep DS scorecard (`npm run audit:ds`; `--json`, `--out`,
  `--baseline <file>` ratchet mode that exits 1 on any metric regression — verified both directions).
  Repo-specific patterns live in the `SCOPE`/`PRIMITIVE_*` block at the top.
- `docs/ds-audit/2026-08-baseline.json` — the frozen "before" snapshot; `docs/ds-audit/README.md` —
  metric definitions. package.json gained `audit:ds`.
- Baseline: 1,081 inline styles · buttons 55/143 (38.5% counting all blessed button-likes; the plan's
  older "18/103 (17%)" was `<Button>`-only) · inputs 0/39 · icons 12/112 · stories + TS 0/14 ·
  **5 modal shells with no dialog a11y — the script found a 5th (`OnboardingActions.js`) the manual
  audit missed**. Also discovered: FollowUpModal + TeamPanel have a LOCAL `<Field>` component —
  never count it as a DS primitive, and absorb it when `app/ui/Field.tsx` ships in Phase 5.

**Full seven-lens evaluation completed same day (also uncommitted):** lenses 3/5/6/7 written up in
`docs/ds-audit/2026-08-lenses.md`. Headlines: focus-visible covers ONLY the six `.btn-*` classes;
task cards/draft cards/Field editors are keyboard-inoperable divs; Drawer leaks tab stops when
closed; no loading or error state exists in any primitive; **52 doc defects** (19 FALSE · 11 STALE ·
5 DEAD · 17 MINOR — skills are the least accurate docs, README the most); and one LIVE BUG:
`globals.css:25` unlayered `* { margin: 0 }` after the Tailwind import kills every `m-*` utility
app-wide (fix scheduled in Phase 2 — grep `m-*` usages first, fixing it activates dead classes).
The wrong filename `build-theme.js` appears in 3 docs + theme.css's own generated header
(hardcoded at build-theme.mjs:41). Visual report artifact (private, republished at the same URL
each phase): https://claude.ai/code/artifact/e930beb8-5ede-466e-a98d-bb9018fa3f70

**Phase 0 committed on `design-system`: `1774a2a`** (her explicit OK, 2026-08-09).

**Phase 1 DONE 2026-08-09 (UNCOMMITTED on `design-system`):** TypeScript foundation.
- devDeps typescript 6 + @types/{react,react-dom,node}; deps clsx + tailwind-merge.
- `tsconfig.json` (strict, allowJs, checkJs:false — Next amended it on first build, that's normal);
  `jsconfig.json` DELETED (Next ignores it once tsconfig exists). `next-env.d.ts` generated.
- `app/ui/cn.ts` (clsx + twMerge — caller classes beat component defaults).
- **`Button.js` → `Button.tsx`, the pattern-setter**: closed unions (ButtonVariant/Size/Tone),
  extends ButtonHTMLAttributes, variants as a Record lookup emitting the SAME class strings as
  before (pixel-identical), plus the app's first `loading` state: aria-busy, disabled, invisible
  (not unmounted) label so width is preserved, centred `.btn-spinner` (new class in globals.css,
  1em currentColor ring; reduced-motion SLOWS it — loading is essential status info).
  ⚠ Spinner centring uses absolute inset-0 + flex, NOT `m-auto` — margin utilities are still dead
  until Phase 2 fixes the reset. Don't "simplify" it to m-auto before then.
- Verified: tsc --noEmit clean · build green · 63/63 unit tests · lint clean · audit ratchet
  passes with tsCoverage 0 → 1/14, no regressions.

**Phase 1 committed: `2548e80`. Phase 2 DONE 2026-08-09 (UNCOMMITTED on `design-system`)** — full
detail in `docs/DS-LOG.md` Phase 2. Headlines: theme.css is now @theme (utilities bg-action /
text-muted / shadow-floating / bg-scrim REAL, verified compiling) + legacy :root aliases;
margin-reset bug FIXED (`@layer base`), all 15 dead margin usages activated and screenshot-verified
harmless; DESIGN.md drift fixed at source (dead tokens removed — `primary` KEPT, design.md lint
requires one; scrim lives in a custom `overlays:` frontmatter section because the spec rejects
non-6-digit-hex). BOTH pending decisions RESOLVED by Caroline 2026-08-09: radius scale aligned to
Tailwind's real values (rung names now match utilities — sm 4 / md 6 / lg 8 / xl 12 / full; the
doc-only 10px never rendered), and text-xl = 20px (matches Tailwind + the login heading; 22 was
paper-only). Zero pixels changed by either. Margin-fix before/after review artifact (flicker
viewer): https://claude.ai/code/artifact/2076a6b8-bbda-41fc-96d7-aa485645d06c . The :3010 review
server has been stopped again; spin one up on a spare port if she asks (never touch 3000/3001).

**Phase 2 committed: `3eaabed`. Phase 3 DONE 2026-08-09 (UNCOMMITTED on `design-system`)** — full
detail in `docs/DS-LOG.md` Phase 3. `eslint-rules/index.mjs` (vector/no-raw-color +
vector/no-arbitrary-tailwind; warn in feature code, ERROR in app/ui; escape hatch =
eslint-disable with reason, pattern in Sparkle.js) + raw-element warnings (app/ui & Menu.js
exempt). Current lint: 0 errors / 187 warnings (= the measured retrofit debt). Rules caught a real
one day one: CalendarDropdown's hardcoded shadow → var(--shadow-floating). `ci.yml` REPLACES
unit-tests.yml: lint / test / build (dummy DATABASE_URL + 2 Supabase vars, verified sufficient) /
audit-ratchet jobs; triggers on main + design-system pushes — ⚠ UNEXERCISED until first push,
watch the 4 jobs then.

**Phase 3 committed: `2a67e21`. Phase 4 DONE + COMMITTED `5affc7a` (2026-08-09, her OK)** — full
detail in `docs/DS-LOG.md` Phase 4. Her review added the Interactive-playground doctrine (76
stories now); she's still reviewing Storybook at her own pace — treat further story tweaks as
review follow-ups, not a new phase. Storybook 10.5.7 (@storybook/nextjs-vite, addons docs/a11y/
pseudo-states; `npm run storybook` port 6006). **74 stories + 14 autodocs across ALL 14 primitives;
11/14 converted to TSX** (Drawer/CalendarDropdown/InsightCard stay .js until Phase 5; their
stories carry typed casts to delete then). DsMeta system: ds-meta.ts schema + <Name>.meta.ts per
primitive, rendered into autodocs via dsMetaDescription (simplified vs plan's custom DocBlock).
Story doctrine: stories document what EXISTS — Drawer's ClosedChildrenStillMounted play PINS the
tab-stop leak and must be UPDATED when Phase 5 fixes it. New Phase-5 fixes found by storying:
active-tab-dims-on-hover (.tab-btn specificity), Calendar month arrows have no accessible name
(stories carry a11y test:"todo"), Drawer's undocumented background prop. Audit script now excludes
*.stories.*/*.meta.* as DS scaffolding (metric-definition change, documented; the ratchet caught
its own staleness — 4 false regressions — before the fix). Verified: 74/14/14 in index.json, tsc
clean, lint 0 errors, 63/63 tests, ratchet green with storyCoverage 0→100% + tsCoverage 0→78.6%.

**Phase 5 DONE 2026-08-11 (UNCOMMITTED on `design-system`)** — full detail in `docs/DS-LOG.md`
Phase 5. New primitives: Modal (native <dialog>, scrim token, 12px radius, experimental) ·
Field/Input/Textarea/Select (on-scale, NEW visuals: input focus border + per-field invalid state)
· Spinner · Badge (token utilities, not inline vars) · Menu MOVED to app/ui (byte-identical,
components/Menu.js = shim, 14 consumers untouched, keyboard model deliberately deferred). Four
pinned gaps FIXED: Drawer inert-when-closed, Calendar arrow labels, active-tab hover dim,
FieldPill/Row keyboard + NEW focus ring. Found: PortalDrawer hand-rolls its own panel, still
leaks — Phase 7 list. Storybook: 119 stories / 22 components. HER RULE IN FORCE: NO screenshots/
VRT baselines until she approves everything in Storybook; audit inlineStyles floor is 1083 (+2
justified: Spinner dynamic fontSize, Menu move) — refresh baseline WITH her phase approval only.

**Phase 5 committed `0452ce0`. REVIEW ROUND 1 COMMITTED `06e5c2e` (2026-08-17, her OK; ratchet
baseline refreshed in the same commit). Working tree clean as of 2026-08-20.** — her 23-point
Storybook review fully processed; see `docs/DS-LOG.md` "Review round 1" for everything. Headlines:
her review exposed a REAL storybook-addon-pseudo-states globals leak (fixed in preview.tsx);
Input→TextField rename; icons 7→36; Foundations docs section (incl. Voice: NO EM DASHES EVER);
new SearchField/Checkbox/TaskTick; commissioned peer review graded B+ and its 5 FIX-NOW items all
shipped same day (incl. a real cn()/tailwind-merge bug eating .text-btn — pinned by cn.test.js,
the DS's first unit test; suite now 66). Storybook: 176 stories / 31 docs / 25 components,
storyCoverage 100%. OPEN Caroline decisions queued: active/selected naming, Badge variant union,
className doctrine, CSS-layer split, InlineProse rename, InlineTextField naming, KanbanCard
extraction (deliberately deferred), Foundations' 5 DESIGN.md ambiguities, peer-review items 6-12.

**Next (handoff 2026-08-20, Caroline signed off to sleep):** she re-reviews the round-1 changes in
Storybook at her leisure (run it HERSELF or via `! cd /Users/caro/Code/onboarding && npm run
storybook` — agent-started servers get killed in this environment). THEN, in order: (1) her queued
decisions — active/selected naming, Badge variant union, className doctrine write-up, CSS-layer
split, InlineProse rename, InlineTextField naming+build, KanbanCard extraction, the 5 DESIGN.md
ambiguities from Foundations, peer-review items 6-12; (2) Phase 6 (VRT + public Storybook) —
REMEMBER her rule: NO screenshots/baselines until she has approved everything in Storybook, and
the branch must be pushed for CI's first run (never push without her explicit say-so). She had a
meeting planned with someone building AI-agent DS tooling — she may return with ideas/requests
from that conversation. (new primitives: Modal on native <dialog>, Field/Input/Textarea/Select, Spinner,
Badge, Menu move) per `docs/DS-PLAN.md` — Phase 5 also picks up the story-writing findings above.

**2026-09-10 — branch PUSHED to origin (her call, for a job application; main untouched, nothing
merged).** All four CI gates re-verified locally first: tsc clean, lint 0 errors / 187 warnings, 66/66
tests, build green, ratchet green vs `ratchet-baseline.json`. This is CI's FIRST real run — check the
4 jobs on GitHub. GOTCHA: a bare local `npm run lint` shows ~319 errors, ALL inside the gitignored
`storybook-static/` build output; CI never sees it. Delete that folder or ignore it in eslint config.
Storybook re-review still pending; Phase 6 still blocked on it.
**2026-09-11 evening — SLICE 0 MERGED TO MAIN by Caroline (PR #3, merge `d916f0b`), production deploys via
Vercel. The DS layer is live but unused by any screen; the only user-visible change is the Phase 2 margin
fix (14 spots, listed on the PR). Slice 1 (Button retrofit) is being built in a separate worktree
`~/Code/onboarding-button` on branch `retrofit/button`, uncommitted; its PR targets main. Everything
else on `design-system` is now in main, so future DS work branches from main per slice.**
**2026-09-11 — three Storybook fixes during her re-review (UNCOMMITTED):** (1) the docs pages of every
component with pseudo-state stories re-rendered in a loop ("flashing") — the round-1 pseudo-globals
reset decorator in `preview.tsx` emitted unconditionally, and on a docs page all stories render
together, so a pseudo story re-armed it every pass; now emits only while `context.globals.pseudo` is
set. (2) MDX tables rendered as raw pipes on 4 Foundations/Menu pages — `remark-gfm` added and wired
into addon-docs in `main.ts` (config change = Storybook restart). (3) bare `<Field label=…>` in five
meta strings rendered as a DOM tag (36 console errors) — backticked. Verified: 0 re-renders/4s, 0
console errors, tables render, story-mode leak guard still works, tsc + lint clean.

### 2026-08-08 — Vector has a logo; favicon + app icons shipped

**Done:** Caroline designed the Vector logo (a filled double chevron pointing up-right, 45° sheared ends — `--action` lilac #C098FF on #18181E, both exact DS tokens). Process: I generated a 20-option HTML gallery, she picked the double chevron (option 14), I did a squared/modernised round of 10 tile treatments referencing logos she likes (Wise-style chunky flat glyphs), and she then designed the final mark herself in Figma. Both throwaway galleries lived in the session scratchpad — already gone, nothing in the repo.

- **Committed and pushed: `756f30b` "Add Vector logo as favicon and app icons"** (Caroline OK'd commit + push explicitly). Contents: `app/favicon.ico` (replaced Next default; 16/32/48 packed), `app/icon.png` (512), `app/apple-icon.png` (180) — all picked up by Next.js **file conventions, zero `layout.js` changes** — plus the master files moved from repo root into `public/`: `vector-logo.png` (615×615 original) and `vector-logo.svg` (her Figma export, glyph-only, transparent bg — use this if the mark ever goes into the sidebar/login UI).
- Favicon PNGs were derived from her PNG with Lanczos (PIL) — no vector redraw, per her explicit instruction. A full size kit (16/32/48/192/512 + apple-touch + .ico) also sits in `~/Desktop/vector-favicons/` for LinkedIn/portfolio use.
- Verified end-to-end on a live dev server: rendered HTML links all three icons, every route serves byte-identical files. **Gotcha: something else (coral-gradient icon, likely the portfolio app) is currently squatting port 3001, so THIS app's `npm run dev` lands on port 3000** — reverse of the documented convention. Careful with `pkill -f "next dev --webpack"`: it can kill the other app too if it runs the same command (it survived this time — different invocation).

**State:** clean working tree except this CLAUDE.md entry; `local HEAD == origin/main == 756f30b`. Dev server stopped. CI push run is asset-only, nothing to watch.

**Next steps:** none pending from this session. Commit this CLAUDE.md entry when Caroline OKs it. If she wants the logo inside the app UI (sidebar header, login page), `public/vector-logo.svg` is the source to use.

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
