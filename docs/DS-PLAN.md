# Vector Agent-First Design System — Audit Playbook + Implementation Plan

## Context

Caroline wants Vector's design system (repo `/Users/caro/Code/onboarding`, deployed at vector.quest) rebuilt as an exemplary **agent-first design system** with Storybook — both as a learning vehicle for founding-designer roles ("how do you build a DS that agents can follow?") and as a shining-star portfolio artefact with a public Storybook and before/after evidence.

Two deliverables:
- **Part A** — a reusable DS evaluation playbook (the method she carries into future jobs) + Vector's concrete findings, made executable as an audit script.
- **Part B** — a phased implementation of the ideal agent-first DS.

**Her decisions (binding):** TypeScript in `app/ui/` only (rest stays JS) · self-hosted visual regression (Playwright + GitHub Actions) with the static Storybook deployed to Vercel (no Chromatic) · retrofit in two stages — targeted worst-offenders first, then a full sweep of every remaining discrepancy (stage two added 2026-08-08).

**Audit headline (verified by exploration):** the token layer is genuinely good (DESIGN.md in `@google/design.md` format → generated `theme.css`, only 4 raw hex values in the app) and agent scaffolding is exceptional (33KB CLAUDE.md, skills, eslint-fix hook). The gaps: tokens aren't wired into Tailwind (no `@theme`, so `bg-action` utilities don't exist), the pipeline emits colours only, no type scale, 1,081 inline styles, Button covers ~17% of buttons (18 `<Button>` vs ~103 raw), 4 copy-pasted modals with zero dialog a11y, 27 hand-rolled inputs, 112 scattered inline SVGs, no Storybook, zero component tests, no lint enforcement of tokens, and doc drift (DESIGN.md claims `@theme` falsely; style-right skill has 2 stale hexes).

**Philosophy the plan encodes:** push knowledge down the stack (token > component default > lint error > doc); closed variant sets via TS unions; all states baked into primitives; stories as the executable contract of blessed states; feedback loops (lint, a11y, VRT) so agents self-correct against failing checks.

---

# Part A — The DS Evaluation Playbook (reusable)

## A.1 Seven lenses, audited bottom-up (each layer bounds the one above)

For each: what to measure → how (mechanical, greppable) → what good looks like. Full pass on an unfamiliar codebase ≈ half a day.

1. **Token layer** — canonical machine-readable source? Raw-value leakage (`grep -rEoh '#[0-9a-fA-F]{3,8}'`)? Token *reachability* (do utilities exist, or only `var()`)? Group completeness beyond colours (type/spacing/radius/shadow/motion)? Runtime CSS generated or hand-copied?
   *Vector:* source + pipeline real, 4 raw hexes (excellent); but no `@theme`, colours-only emission, no type scale.
2. **Component coverage** — the *ratio* with its raw counts alongside (primitive usage ÷ total instances, always reported as `18/103 (17%)`, never the percentage alone) per category (buttons, inputs, icons); copy-paste detection; which primitives are missing entirely vs under-adopted.
   *Vector:* Button 17%, inputs 0%, icons ~6%, 4 duplicate modals, 8 missing primitives, Menu in the wrong layer.
3. **State completeness** — per primitive tick hover/active/focus-visible/disabled/loading/error/empty; states component-owned or re-derived per call site? reduced-motion honoured?
   *Vector:* CSS-class layer strong (full state coverage, reduced-motion yes); bespoke buttons + all inputs have nothing; no loading state anywhere.
4. **Accessibility floor** — grep `role="dialog"|aria-modal|aria-busy|focus-visible` counts, then trace worst interactive patterns (modal focus trap? dropdown keyboard nav? label association?). Is contrast validated mechanically?
   *Vector:* modals have zero dialog semantics/no focus trap; contrast IS lint-validated (strength).
5. **Enforcement & feedback loops** (the agent-critical lens most audits skip) — does lint *fail* on raw values? lint/build/VRT/a11y in CI? Can an agent discover it broke something without a human looking?
   *Vector:* `lint:ds` validates DESIGN.md itself but nothing enforces token usage in app code; CI = unit tests only.
6. **Docs & drift** — diff every doc claim against the code; grep documented classes/tokens and confirm they exist and match; find dead CSS. Docs that lie are worse than no docs for agents.
   *Vector:* `@theme` claim false, InsightCard radius contradiction, 2 stale hexes in style-right, `.task-filter-btn` dead.
7. **Agent affordances** — knowledge pushed down the stack or all prose? Rules wired to triggers (skills/CLAUDE.md)? Executable contract (types, stories) or only human pages? Variant sets closed or stringly-typed?
   *Vector:* Layer-3 scaffolding exceptional; Layers 1/2/4 prose-only — documented for agents but not *enforced* for agents.

## A.2 Make it executable: `scripts/audit-ds.mjs`

Zero-dep node script (fs + regex, style of existing scripts). Metrics: `rawHex` (with allowlist for Sparkle.js SVG stops), `rawRgba`, `inlineStyles`, `arbitraryTw`, `hardcodedGeometry`, `buttonCoverage`, `inputCoverage`, `iconCoverage`, `storyCoverage`, `tsCoverage`, `a11yDialogs`. All coverage metrics emit count + total + ratio together (`18/103 (17%)`). Interface: scorecard table by default; `--json`; `--baseline docs/ds-audit/baseline.json` prints deltas and **exits non-zero on regression** (CI ratchet). Patterns live in a `METRICS` array at the top so the script ports to any React codebase in ~10 minutes — that portability + the seven lenses IS the reusable playbook.

---

# Part B — Phased implementation

Order rationale: audit first (the "before" snapshot is unrepeatable), then TS + token foundations (everything derives from them), then enforcement (so later work is born compliant), then Storybook (so new primitives land with stories), then primitives, then VRT + deploy, then the retrofit in two stages (targeted, then full sweep — both protected by tests), then agent scaffolding + portfolio wrap. **Each phase lands independently on `main`.**

## Phase 0 — Baseline audit (½ day)
- Write `scripts/audit-ds.mjs`; add `"audit:ds"` script to package.json.
- Run; commit `docs/ds-audit/2026-08-baseline.json` + `docs/ds-audit/README.md` (metric definitions = playbook doc). Fix nothing.
- **Exit:** numbers sanity-match the manual audit (1,081 inline styles, ~103 raw buttons, 27 inputs). **Verify:** `npm run audit:ds -- --json` spot-check.

## Phase 1 — TypeScript foundation + `cn()` (½ day)
- devDeps: `typescript`, `@types/react`, `@types/react-dom`, `@types/node`; deps: `clsx`, `tailwind-merge`.
- `tsconfig.json`: `strict`, `allowJs: true`, `checkJs: false`, paths `@/*`; **delete `jsconfig.json`** (Next ignores it once tsconfig exists).
- `app/ui/cn.ts` (clsx + tailwind-merge). Skip cva — variants map to `.btn-*` classes, a `Record<Variant,string>` lookup suffices.
- Convert **Button.js → Button.tsx** as the pattern-setter: closed unions (`'primary'|'secondary'|'tertiary'|'destructive'|'text'`, size `'xs'|'sm'`), extends `ButtonHTMLAttributes`, new `loading` prop (aria-busy + width-preserving spinner) — the baked-in-states exemplar. Other primitives convert lazily as stories land.
- Keep dependency direction ui → nothing (already true).
- **Exit/verify:** `npx tsc --noEmit && npm run build && npm test` green; `<Button>` call sites unchanged.

## Phase 2 — Token pipeline v2: `@theme` + all groups + drift fixes (1 day, highest leverage)
- **Rewrite `scripts/build-theme.mjs`** to emit a two-part `app/theme.css`:
  1. `@theme` block (Tailwind v4 namespaces `--color-*`, `--text-*` type scale, `--radius-*`, `--shadow-floating`, `--ease-standard`, `--font-sans`) → `bg-action`, `text-muted`, `shadow-floating` utilities become real.
  2. `:root` **legacy-alias block** (`--bg-elevated: var(--color-bg-elevated)` etc.) so 1,201 lines of globals.css + 1,081 inline `var()` styles keep working untouched — zero-risk migration; aliases deleted post-retrofit (or never — they're generated, cost nothing).
- Data source: keep `design.md export --format tailwind` for colours/fontSize/radius/spacing, but **the exporter drops shadows + motion (verified)** — parse those from DESIGN.md frontmatter YAML directly. DESIGN.md stays single source; `design.md lint` stays validator.
- Keep DESIGN.md names verbatim in utilities (agents grep DESIGN.md and must find the same word) — accept `bg-bg`. Radius overrides ≈ no-ops vs Tailwind defaults except `lg` (10px vs 8px) — grep `rounded-*` usages first; treat shifts as intentional alignment.
- Add the planned **type scale** (12/14/16/18/22 + line-heights) to DESIGN.md YAML; add `colors.scrim: rgba(0,0,0,0.6)` (for Modal).
- Fix drift: correct InsightCard radius prose, delete `.task-filter-btn` dead CSS (the `@theme` claim becomes true). **Fix the live reset bug found by Lens 6:** globals.css:25 has an unlayered `* { margin: 0 }` after the Tailwind import, which defeats every `m-*` utility app-wide (unlayered beats `@layer utilities`); scope it into a layer — and grep existing `m-*` usages first, since fixing it *activates* previously-dead classes. Also remove the 5 dead tokens/aliases (`--warning`, `--nav-hover`, `--accent-muted`, `primary`/`secondary`/`tertiary`) from DESIGN.md. Full 52-defect inventory: `docs/ds-audit/2026-08-lenses.md`.
- **Exit/verify:** `npm run build:ds && npm run lint:ds && npm run build` green; `grep -c 'bg-action' .next/static/css/*.css` ≥ 1; click through all 8 routes — visually unchanged.

## Phase 3 — Enforcement: ESLint token rules + real CI (1 day)
- Inline flat-config plugin (`plugins: { vector: {...} }`, rule impls in `eslint-rules/*.mjs` — no published package):
  - `vector/no-raw-color` (hex/rgb in JSX attrs, style objects, template strings; allowlist Sparkle.js via eslint-disable + rationale comment — the agent-legible escape hatch).
  - `vector/no-arbitrary-tailwind` (`\[#`, `\[[\d.]+(px|rem)` in className). (Evaluate `eslint-plugin-better-tailwindcss` v4 support at install; the 30-line custom rule is the dependable fallback.)
  - `no-restricted-syntax` on raw `<button>`/`<input>`: **error in `app/ui/`, warn elsewhere**, ratcheted to error per-directory as retrofit proceeds.
- Severity strategy: warn repo-wide so the existing PostToolUse `eslint --fix` hook surfaces violations to agents on every edit without a 1,000-warning CI wall; the audit ratchet is the repo-wide gate.
- CI: `unit-tests.yml` → `ci.yml` with jobs `lint` (`npm run lint && npm run lint:ds`), `test`, `build` (check whether build needs dummy Supabase env vars), `audit` (`audit:ds --baseline` ratchet).
- **Exit/verify:** 4 CI jobs green; a scratch `color:'#fff'` triggers the warning locally + via hook.

## Phase 4 — Storybook (1–2 days)
- Framework **`@storybook/nextjs-vite`** (app's `--webpack` flag is irrelevant — Storybook's bundler is independent; handles next/font/image/navigation mocks). Check current SB major's Next 16 support at install.
- Tailwind 4 in preview: `.storybook/preview.ts` imports `../app/globals.css`; Vite auto-detects root `postcss.config.js`; fallback `@tailwindcss/vite` in `viteFinal`. Add `prestorybook`/pre-build hooks running `build:ds` so theme.css exists.
- `main.ts`: stories glob `app/ui/**/*.stories.tsx`; addons `@storybook/addon-docs` (autodocs from TS types — why Phase 1 precedes), `@storybook/addon-a11y`, `storybook-addon-pseudo-states`. `preview.ts`: dark bg = `--bg`, app font decorator.
- **Stories for all 15 existing primitives**, converting each to `.tsx` as its story lands. Doctrine: every blessed state is a named story (Primary / hover via pseudo / Disabled / Loading / LongLabel / AllVariants grid for VRT).
- **Component meta manifests:** colocated `app/ui/<Component>.meta.ts` exporting typed `DsMeta` (`status: 'stable'|'experimental'|'deprecated'`, `useWhen`, `dontUseWhen`, `a11y`, `tokens`; schema in `app/ui/ds-meta.ts`). Agents grep it as plain TS; Storybook renders it via a custom autodocs block (`.storybook/blocks/DsMetaBlock.tsx`); build step aggregates all meta into `storybook-static/ds-manifest.json` — the queryable agent surface alongside `index.json`.
- **Play functions** on interactive primitives via `storybook/test`. `@storybook/addon-vitest` if peer-compatible with Vitest 4; if not, defer — VRT screenshots run *after* play functions, so behaviour is still exercised in CI.
- **Exit/verify:** `npx storybook build` succeeds; index.json ≥ 40 stories; a11y addon clean on primitives; every story file has a sibling `.meta.ts`.

## Phase 5 — New primitives (2–3 days, each independently landable)
Each ships as `.tsx` + stories + `.meta.ts` + play function, born under Phase-3 lint. In retrofit-leverage order:
1. **`Modal.tsx`** — native `<dialog>` + `showModal()`: free focus trap/ESC/top-layer/`::backdrop` (styled with the scrim token), implicit `role="dialog"`/`aria-modal`, `aria-labelledby` wired. Radius `rounded-xl` (12px — resolves the 20-vs-12 inconsistency in favour of the documented scale; visible change, documented as intentional). Gotchas: `showModal` synced to `open` prop via effect; scrim-click checks click target is the dialog itself.
2. **`Field.tsx` + `TextField.tsx` + `Textarea.tsx`** (shipped as Input + a Select that was later removed, see Phase 7) — Field owns label/help/error + `htmlFor` (`useId`); controls carry error state + `aria-invalid`; styles extracted from the best current hand-rolled instance into `.input` classes (consistent with the CSS-class architecture).
3. **`Spinner.tsx`** (feeds Button loading), **`Badge.tsx`** (the only status pill; the dead StatusBadge.js was deleted 2026-09-11).
4. **Move Menu** → `app/ui/Menu.tsx` with a re-export shim at `app/components/Menu.js` (0 call sites change).
5. Toast: deferred, listed in DESIGN.md "planned" only — no ghost components.
- **Exit/verify:** all in Storybook with full state stories; Modal play function asserts focus containment + ESC; `audit:ds` shows storyCoverage/tsCoverage rising; `tsc --noEmit` clean.

## Phase 6 — Visual regression + Storybook deploy (1 day)
- Separate `playwright.vrt.config.ts` (existing config seeds a live DB — VRT must not touch it): `testDir: vrt`, webServer serves `storybook-static`, `reducedMotion: 'reduce'`, **platform-free `snapshotPathTemplate`** (baselines are linux-only by fiat).
- One spec `vrt/stories.spec.ts`: read `storybook-static/index.json`, filter `type==='story'` minus `no-vrt` tag, loop: goto `iframe.html?id=…`, await `document.fonts.ready`, `toHaveScreenshot({ animations: 'disabled', maxDiffPixelRatio: 0.01 })`.
- Flake control: baselines generated in CI/docker only (`npm run vrt:update` wrapping the docker playwright image); darwin runs are eyeball-only; animated stories (Sparkle, streaming border) tagged `no-vrt` or given a paused variant; verify one baseline stable across two CI runs before committing the set.
- CI: `storybook` job (build + artifact) and `vrt` job (needs it, chromium only, diff artifacts on failure).
- **Vercel: separate project** on the same repo (framework Other, build `npm run build:ds && npx storybook build`, output `storybook-static`) → e.g. `ds.vector.quest`. **Gotcha:** root `vercel.json` cron leaks into the new project — move the cron to the main project's dashboard and drop it from `vercel.json`. Optional Ignored Build Step so the DS project only rebuilds on DS paths.
- **Exit/verify:** two consecutive CI runs green with no baseline churn; public Storybook URL live (`curl …/index.json`).

## Phase 7 — Staged rollout, one component per PR (replaces "stage one / stage two", Caroline 2026-09-11)

**Why staged:** merging the DS layer changes nothing users see (nothing in `app/ui` is imported by a screen until its retrofit), and Vercel builds a preview URL for every PR. So each component goes to production on its own, and Caroline reviews ONE component across the app on the preview, never the whole app at once. The old Phase 7 (targeted) and Phase 8 (full sweep) content is folded into the slices below; Phase 9 interleaves.

**Every slice follows the same loop:** approve in Storybook → retrofit its call sites → PR → Caroline reviews the Vercel preview → merge → deploy. **Exit per slice:** audit ratchet green (baseline refreshed in the same PR, with her OK), `npm run test:e2e` green, keyboard play test on every touched primitive, VRT green once Phase 6 exists, 0 console errors, her sign-off on the preview.

0. **Foundation merge (first, soon):** everything on `design-system` today: Storybook, primitives, lint rules, CI, the Phase 2 token pipeline. The only user-visible change is the Phase 2 margin-reset fix (15 dormant `m-*` utilities activated, screenshot-verified 2026-08-09): that is what she reviews on the preview. The ratchet baseline refresh (held 2026-09-11) lands in this PR.
1. **Button:** 47 `.btn-*`-classed raw buttons are mechanical swaps; the 6 raw `.text-btn` sites (ContactsPanel ×3 incl. Revoke → `tone="danger"`, PortalDrawer upload, ActionsTab + MeetingsTab Clear) → tertiary, then delete `.text-btn*` CSS; triage the ~23 bespoke (convert what maps; eslint-disable + reason for the rest).
2. **Badge:** the 7 hand-rolled status pills (TaskCardView, TaskDrawer picker, PortalTaskCard, AIDraftInbox, CreateTaskModal, InsightStatusPill fold-in, board-header health/blocked) → `<Badge status|color variant size>`; delete the inline colour lookups. Visible change to expect: the overview insight pills go from 12px/500 to 14px/400 (her "become the same" call).
2b. **TabBar (added 2026-09-11, her call: "we already have TabBar"):** the portal's tab strip (`app/portal/[onboardingId]/PortalShell.js`) → `TabBar`. The three SEGMENTED controls left raw in slice 1 (`PipelineTimeline.js` filter, `CreateOnboardingModal.js` type switch, `FollowUpModal.js` tone picker) are pill groups, not underline tabs: her call whether they become TabBar or a small `SegmentedControl` primitive; until then they stay raw with their reason.
3. **Popover + keyboard + Select** (the big one, sub-sliced):
   3a. Internal `Popover` (anchoring, outside click, Escape, focus return) + a list-keyboard hook (arrows, Home/End, type-ahead, Enter/Space, Tab closes) UNDER the existing MenuList/MenuOption/MenuTriggerButton API: 14 consumers unchanged, no visual change, keyboard works everywhere at once.
   3b. `Select` (value picker): `trigger="inline" | "boxed"` (FieldRow / FieldPill become its triggers), `role=combobox` trigger + `listbox`/`option` list; stories + meta; zero consumers yet.
   3c. `multiple` (aria-multiselectable, checkbox visual) + `searchable` (combobox input, aria-activedescendant, empty state); retire the experimental MenuList `multiselect` / MenuOption `checked` pair (nothing renders it).
   3d. Narrow `Menu` to action menus (`role=menu`/`menuitem`); old names stay as deprecated aliases + the `app/components/Menu.js` shim.
   3e. Migrate one surface class per PR: TaskDrawer inline pickers → modal boxed pickers → Members (drawer + modal) → the native Status select in OnboardingActions.js → AIDraftInbox's copied pills → meatballs onto Menu → Sidebar user menu + notification bells. CalendarDropdown moves onto the shared Popover here.
   Open (Caroline): "Showing" filter pills as a third trigger or a Filter component · rename `active`→`open`/`selected` first · Field wrapping a Select · AIDraftInbox disabled/read-only pills as disabled Select or Badge.
4. **Modal + form fields:** the 5 scrim shells (`CreateTaskModal.js`, `CreateOnboardingModal.js`, `MemberModal.js`, `FollowUpModal.js`, `OnboardingActions.js`) → `<Modal>`, their form bodies → Field/TextField/Textarea; remaining hand-rolled inputs (TaskDrawer, search fields → SearchField, ContactsPanel). Kills ~700 duplicated lines + the dialog a11y gap. Before/after screenshots for the case study.
5. **Pill clear:** the 3 local PillClearButton copies (TaskDrawer, MemberModal, CreateOnboardingModal) → `onClear` on FieldRow/FieldPill.
6. **Icons:** the ~112 scattered inline SVGs → the `Icons.tsx` registry (auto-generated grid story); genuine one-off illustrations stay inline with a disable + reason.
7. **Inline styles + geometry sweep, per directory:** token `var(--…)` styles → the Phase 2 utilities; hardcoded geometry → radius/spacing tokens (floor: dnd-kit transforms and truly dynamic values stay inline; measure the floor, don't chase zero); ratchet every `vector/*` rule warn→error in each cleaned directory; delete the legacy `:root` alias block from `build-theme.mjs` output at the end.
8. **Keyboard walk of every screen** (Tab/Shift+Tab reach everything interactive, no traps, every dropdown/modal/drawer operable without a mouse) as the closing slice.

- **Order rationale:** 0 first (unblocks previews and CI); 1 and 2 are mechanical and low-risk, good rehearsals of the loop; 3a before anything that opens a dropdown (keyboard is a hard rule, and the Status retrofit must not lose the native select's keyboard behaviour); 4 after 3 so the modal form bodies land on the final Select; 6 and 7 are sweeps and can interleave with Phase 9.
- **Exit (whole phase):** scorecard at floor (rawHex 0 outside allowlist, button/input/icon coverage ≈100%, inlineStyles at the measured dynamic-only floor, 1 modal implementation, dialog semantics everywhere), lint at error everywhere, aliases gone, every DS primitive keyboard-operable with a play test, e2e + VRT green, keyboard walk clean.

## Phase 8 — (merged into Phase 7 as slices 6 to 8, 2026-09-11)

Kept as a heading so cross-references resolve. The full-sweep work (icons, inline styles, lint warn→error, alias block, final baseline) is slices 6 and 7 above; the keyboard walk is slice 8.

## Phase 9 — Agent scaffolding refresh (½–1 day; interleaves with Phase 7, ideally straight after slice 0 so the agents doing slices 1 to 8 benefit)
- **style-right skill regenerated FROM tokens:** `build:ds` rewrites its token table between `<!-- TOKENS:START/END -->` markers — the stale-hex drift class becomes structurally impossible. Mirror to `.cursor/rules`.
- **design-system skill** rewritten around the four-layer doctrine + the contract line: *"if the state you need has no story, you're off-road — add the story first"*; points at `*.meta.ts` for use-when; prefers `bg-action` utilities over inline `var()`.
- **New `skills/storybook`:** run/build, story anatomy (story + meta.ts + play), querying index.json/ds-manifest.json, VRT baseline update (docker), the no-vrt tag.
- **CLAUDE.md:** Menu path update, audit ratchet in workflow, new-primitive checklist (tsx + unions + states + story-per-state + meta + play + a11y + VRT baseline), decision-journal entry for the radius resolution.
- **Agent-navigation package (added 2026-09-10 after a review of how agents fail on flat component folders — they read every file, burn tokens, and still pick by name alone; the fix is letting them narrow before they read):**
  1. **`DsMeta` gains `intent`** — closed union `'action' | 'input' | 'navigation' | 'data-display' | 'feedback'`, one line per primitive. Groups the index below and can drive the Storybook sidebar. Deliberately NOT an atomic-level axis (atom/molecule/…): with ~25 primitives that are all atoms or molecules it adds a question with no discriminating power.
  2. **`DsMeta` gains `pairsWith?: string[]`** — the components this one is built to sit with (Field ↔ TextField/Textarea, Modal ↔ Button). No `dataShape` field: the TypeScript props already say that.
  3. **Generated `app/ui/INDEX.md`** — `build:ds` writes one table (name · intent · status · first `useWhen` line · path) from the `*.meta.ts` files, grouped by intent, between `<!-- INDEX:START/END -->` markers. An agent reads one file to orient instead of 25 meta files. Generated from source, never hand-maintained, so it cannot drift (a hand-kept index is the same drift class as the stale hexes). Depends on 1.
  4. **`metaCoverage` metric in `audit-ds.mjs`** — `<n>/<total>` primitives in `app/ui` with a colocated `*.meta.ts`, under the ratchet. "Every file in app/ui MUST have one" stops being prose.
  5. **Two doctrine additions for the skill rewrites above:** the design-system skill teaches the two orienting questions — *what job does this need to do* (pick the intent) → *is there a blessed primitive for it* (read INDEX.md, then its meta) — before any code is read; the `review` skill (stale: still points at `app/components/Menu.js` and pre-Phase-2 token names) is rewritten to check the DsMeta contract and to report every refusal as *problem · evidence · suggested fix*.
  Estimated +½ day on the phase. Order: 1 → 2 → 3 (index needs intent) → 4 → 5.
- **Exit/verify:** second `npm run build:ds` run is idempotent (no diff — now covers INDEX.md too); zero stale hexes in skills/; `metaCoverage` at `n/n`.

## Phase 10 — Portfolio wrap-up (in the portfolio repo)
- Final audit → `docs/ds-audit/2026-XX-after.json`. The before/after table is the case-study spine: raw buttons 103→~20 after stage one, near-0 after the sweep · inputs 27→~3→0 · modal implementations 4→1 · story coverage 0→100% of primitives · dialogs with a11y semantics 0→all · CI checks 1→6.
- Assets: public Storybook URL, scorecard table, before/after modal shots, four-layer + pipeline diagram (DESIGN.md → theme.css → utilities → lint → VRT), and Part A presented as "how I'd audit *your* design system in week one".
- Build the page with the existing `case-study` skill in `/Users/caro/Code/portfolio`.

---

## Consolidated risks & gotchas
- `@theme` is PostCSS-level — works under the pinned `--webpack` flag; re-verify utilities compile as Phase-2 exit check.
- `design.md` exporter drops shadows/motion (verified) — bridge via frontmatter parse; simplify if a future version adds them.
- Radius overrides shift existing `rounded-lg` 8→10px — grep first, document as intentional.
- Storybook ↔ Next 16 / Vitest 4 peer ranges — verify at install; fallbacks specified (defer addon-vitest; VRT still exercises play functions).
- VRT flake — linux-only baselines, platform-free paths, fonts.ready, animations disabled, no-vrt tag, docker update command.
- Mixed JS/TS — delete jsconfig, `checkJs: false`, keep ui-layer imports self-contained.
- Legacy `:root` aliases are the zero-risk bridge; generated, cheap; deleted at the end of Phase 8's full sweep once inline `var()` usage bottoms out.
- `vercel.json` cron leaks into the Storybook Vercel project — move to dashboard.
- Lint starts at warn outside `app/ui/` — the hook gives agents the signal; the audit ratchet is the hard gate until retrofit completes.

## Critical files
- `scripts/build-theme.mjs` — rewrite (@theme + all groups + aliases + skill-table regen)
- `scripts/audit-ds.mjs` — new (Part A executable)
- `DESIGN.md` — type scale + scrim token + drift fixes
- `eslint.config.mjs` + `eslint-rules/*.mjs` — token enforcement
- `app/ui/Button.js → .tsx` — pattern-setter
- `app/ui/Modal.tsx`, `Field/TextField/Textarea.tsx`, `Spinner.tsx`, `Badge.tsx`, `Menu.tsx` — new primitives
- `.storybook/` — new; `playwright.vrt.config.ts` + `vrt/stories.spec.ts` — new
- `.github/workflows/ci.yml` — lint/build/audit/storybook/vrt jobs
- `skills/style-right`, `skills/design-system`, `skills/storybook` (new), `CLAUDE.md` — scaffolding refresh
