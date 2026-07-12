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

- **2026-07-12 — Customer portal desktop layout brought in line with the vendor board.** The portal was designed mobile-first and stretched badly at desktop width. Four changes: (1) "Your tasks" on Overview is now a wrapping row of fixed 264px cards (`.portal-task-grid` in `globals.css`, gap 8px, left-aligned) instead of one full-width card per row; (2) the All Tasks board columns are fixed `width/minWidth/maxWidth: 264` + 24px gutter, copied from `OnboardingDetailClient.js` — previously `minWidth: 240` with no cap, so a long title stretched its column and columns came out uneven; (3) `PortalTaskCard` titles clamp to 2 lines (`.portal-task-title`), same treatment as `TaskCardView.js`; (4) the full-width "N updates since you were last here" banner is **deleted** (`PortalUpdatesBanner.js`) and replaced by `PortalNotificationBell.js` in the header — same bell + badge + popover as the vendor `NotificationBell`, but fed by `/api/portal/activity` (the vendor bell's `/api/notifications` is vendor-auth-scoped and would 401 for a portal contact). Opening the popover marks activity seen. The header now carries the company logo left of "Welcome, {name}" (`getPortalOnboarding` gained `companyLogoUrl`); the old top-right company chip is gone — the customer knows who they are. **The 264px width and the 2-line clamp are both `@media (min-width: 768px)`-guarded** so the mobile portal renders byte-identically to before.
- **2026-07-11 — "On hold" is a single, mutually-exclusive status, not a multi-tag.** Considered `status` → `String[]` (any combo, e.g. In progress + Blocked) but chose to keep `status` a single string and add "On hold" as a 6th value (cold candy pink `--candy #ff9ee5`, distinct from the warm `--danger` used for Blocked). Reason: ~40 files read `.status`; multi-tag would touch health calc, filters, picker, seed/snapshot — too much blast radius for the value. Blocked still wins onboarding health. Wired via `TASK_STATUSES` in `lib/constants.js` so the picker, `lib/taskFilters.js`, and the AI draft inbox all inherit it.
- **2026-07-11 — Status/health badges standardised to the kanban card badge.** The card status badge (`TaskCardView.js`, `text-sm rounded-md`, padding 2/4, 0.5px border, ~23px) is the single reference. Overview pills (`InsightCard.js` `InsightStatusPill` + `RiskCard`) and the board-header pills (`OnboardingDetailClient.js`) were smaller/tighter; matched them to 14px / line-height 20px / weight 400, rendered `inline` so they share the 23px height. The header "N blocked" count was a direct flex child → flex blockified it to `display:block` (2px taller); a plain wrapper `<span>` lets it flow inline. The two board-header pills (health + blocked count) are **filled** (solid bg + `--text-dark` + transparent border) as high-level status indicators, matching the `Declining` InsightStatusPill treatment.
- **2026-07-10 — Demo card statuses diversified via targeted UPDATEs, never a reseed.** Reseeding destroys injected Miniti meetings + AI drafts (see `prisma/reset-demo-data.js` warning), so status changes were applied per-task then blessed into `prisma/fixtures/demo-snapshot.json` via `scripts/demo-snapshot.js --capture`. Raycast (#63) deliberately pushed to 30% blocked → red/Blocked health; beehiiv/Function Health/Flock Freight/ChowNow sit At risk; rest On track.
- **2026-07-10 — Drawer first-open animation fix.** `TaskDrawer` returned `null` before a task was selected, so the first click mounted the panel already `--open` → it appeared instead of sliding. Keep the `Drawer` shell mounted (closed, offscreen) when there's no task so the first open transitions from `translateX(100%)`.

---

## Session Log / Handoff

_Newest first._

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
