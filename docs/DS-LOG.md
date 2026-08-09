# DS build log

Phase-by-phase record of the agent-first design system build. One entry per
phase, appended when the phase lands: what changed, which files, the numbers,
how it was verified. The plan is `docs/DS-PLAN.md`; the audit records are in
`docs/ds-audit/`. This file is the "what actually happened" ledger — query it
with grep or read it top to bottom.

---

## Phase 0 — Baseline audit · 2026-08-08 · commit `1774a2a`

**What:** the audit made executable, and the untouched "before" state frozen.

- `scripts/audit-ds.mjs` — zero-dependency DS scorecard. `npm run audit:ds`;
  flags: `--json`, `--out <file>`, `--baseline <file>` (ratchet mode: prints
  deltas, exits 1 on any regression — verified in both directions). Repo-specific
  patterns live in the `SCOPE` / `PRIMITIVE_*` config block at the top.
- `docs/ds-audit/2026-08-baseline.json` — frozen quantitative snapshot.
- `docs/ds-audit/README.md` — metric definitions.
- `docs/ds-audit/2026-08-lenses.md` — the qualitative lenses (3, 5, 6, 7):
  per-primitive state matrix, enforcement inventory, 52-defect doc-drift
  inventory, agent-affordances diagnosis.
- `docs/DS-PLAN.md` + `docs/DS-PLAN-SIMPLE.md` — the 10-phase plan of record
  and its plain-English twin (kept in sync, heading for heading).

**Baseline numbers:** 1,081 inline styles · buttons 55/143 (38.5%) · inputs
0/39 · icons 12/112 · stories 0/14 · TS 0/14 · 5 modal shells without dialog
semantics · 15 raw hexes (3 distinct) · 52 doc defects (19 FALSE / 11 STALE /
5 DEAD / 17 MINOR).

**Notable discoveries:** a fifth broken modal the manual audit missed
(`OnboardingActions.js`); a live bug — unlayered `* { margin: 0 }` at
`globals.css:25` (from the Create-Next-App initial commit `c2b3bd5`) defeats
every Tailwind margin utility; exactly 15 margin-utility usages in 12 files are
therefore dead; a local `<Field>` component in FollowUpModal/TeamPanel that must
not count as a DS primitive.

**Verified:** script counts cross-checked against the manual exploration
(inline styles 1,081 exact; raw inputs 39 exact); ratchet passes on no-change,
fails (exit 1) on a doctored regression.

---

## Phase 1 — TypeScript foundation · 2026-08-09

**What:** TypeScript in the DS layer only, the `cn()` helper, and Button
converted as the pattern-setter every later primitive copies.

- Deps: `typescript` 6, `@types/react`, `@types/react-dom`, `@types/node`
  (dev); `clsx`, `tailwind-merge` (runtime).
- `tsconfig.json` — strict; `allowJs: true`, `checkJs: false` so the 18k-line
  JS app compiles but is not type-checked; Next.js amended it on first build
  (jsx `react-jsx`, `.next/types` includes) — that's expected, keep its edits.
  `jsconfig.json` deleted (ignored once tsconfig exists). `next-env.d.ts`
  generated (gitignored in this repo).
- `app/ui/cn.ts` — `clsx` + `twMerge`. Caller-supplied Tailwind classes now
  beat component defaults regardless of order; custom classes pass through.
- `app/ui/Button.js` → **`Button.tsx`**:
  - Closed unions: `ButtonVariant` (`primary | secondary | tertiary |
    destructive | text`), `ButtonSize` (`xs | sm`), `ButtonTone`
    (`action | danger`). Invalid values are now compile errors in TS files.
  - `ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>`.
  - The five if-branches collapsed into a `VARIANT_CLASSES` Record emitting the
    same class strings as before — pixel-identical by construction.
  - **New `loading` prop** (the app's first loading state): sets `aria-busy`,
    disables interaction, renders the label `invisible` (not unmounted) so the
    button keeps its width, centres a spinner overlay.
- `app/globals.css` — new `.btn-spinner` (1em currentColor ring, `btn-spin`
  keyframes; reduced motion SLOWS the spin to 1.5s rather than freezing it —
  loading is essential status information). Placed with the button styles.
  ⚠ The spinner overlay centres via `absolute inset-0 + flex`, deliberately
  NOT `m-auto`: margin utilities stay dead until Phase 2 fixes the reset.

**Verified:** `tsc --noEmit` clean · `npm run build` green · 63/63 unit tests ·
lint clean · audit ratchet: `tsCoverage 0 → 1/14`, zero regressions.

---

## Phase 2 — Token pipeline v2 · 2026-08-09

**What:** the tokens plugged into Tailwind (the DS's front door), the
margin-reset live bug fixed, and the drift the audit found corrected at the
source.

- **`scripts/build-theme.mjs` rewritten.** `app/theme.css` is now two blocks:
  1. `@theme` — Tailwind v4 token registration. Every DESIGN.md colour (38
     entries incl. the new `scrim`), `--font-sans`, `--shadow-floating` and
     `--ease-standard` are now BOTH CSS variables and real utility classes:
     `bg-action`, `text-muted`, `border-border`, `shadow-floating`, `bg-scrim`
     all verified compiling in the production build.
  2. `:root` legacy aliases — every pre-@theme name (`--action`,
     `--bg-elevated`, …) aliased onto the @theme variable, so all existing CSS
     and inline styles render identically. Deleted in Phase 8.
  - Colours come from `design.md export` (resolves `{colors.x}` references);
    shadows/motion/fontFamily are parsed from the frontmatter directly (the
    exporter drops those groups); the translucent `scrim` lives in a custom
    `overlays:` frontmatter section because the design.md spec rejects
    non-6-digit-hex colours (learned the hard way: rgba() and #00000099 both
    fail lint).
- **Deliberately NOT emitted** — no `--radius-*` or `--text-*` overrides.
  Both questions were put to Caroline with the usage data and RESOLVED
  2026-08-09: the documented scales align to Tailwind's real values (radius
  rung names now match the utilities — sm 4 / md 6 / lg 8 / xl 12; type scale
  xl = 20px). The old doc-only values (lg 10px, xl 22px) had never rendered
  anywhere, so zero pixels changed and the scales are simply live-by-default.
  The 20px card radius stays documented as the one bespoke value outside the
  scale.
- **The margin-reset bug fixed**: `* { box-sizing; margin: 0 }` moved into
  `@layer base` (unlayered rules beat Tailwind's layered utilities). The 15
  dead margin usages in 12 files activated. Before/after screenshots taken of
  login, dashboard, settings, onboarding detail, and the narrow overlay: every
  change is the intended small gap (button offset on login, footer breathing
  room on dashboard, overlay heading spacing improved); zero breakage.
  Not screenshotted (interaction-gated, safe by inspection): the `mt-1`
  dropdown offsets in PeoplePicker/Sidebar and the `ml-2` close-button gaps in
  the three modals.
- **DESIGN.md drift fixes at the source:** the `@theme` claim is now TRUE
  (reworded to describe the real pipeline); Architecture section corrected
  (tokens in theme.css, not globals.css); InsightCard/Shapes radius claims
  corrected (20px bespoke, outside the scale); Future plans rewritten to
  reflect reality + the two pending decisions; typography scale formalised in
  the frontmatter. **Dead tokens removed:** `warning`, `navHover`,
  `accentMuted`, `secondary`, `tertiary` aliases (`primary` kept — design.md
  lint requires one; documented as spec ceremony). **Dead CSS removed:**
  `.task-filter-btn`.
- `lint:ds` passes at 0 errors / 0 warnings (previously it wasn't run in
  anger; the scrim experiments proved it actually validates).

**Verified:** `build:ds` + `lint:ds` clean · utilities compile (temp component
grep against `.next/static/css`) · `tsc` clean · 63/63 tests · lint clean ·
production build green · audit ratchet zero regressions · five before/after
screenshot pairs eyeballed by me AND published for Caroline as a flicker-viewer
artifact (link in CLAUDE.md); she signed off 2026-08-09.

---

## Phase 3 — Enforcement: DS lint rules + real CI · 2026-08-09

**What:** breaking the design system now produces red squiggles, and CI grew
from one gate to four.

- **`eslint-rules/index.mjs`** — inline flat-config plugin (`vector`):
  - `vector/no-raw-color`: flags hex / `rgb()` literals in strings and
    template literals. The escape hatch is
    `eslint-disable-next-line vector/no-raw-color -- <reason>`
    (pattern established in `app/ui/Sparkle.js` for its two SVG gradient
    stops, which genuinely can't resolve CSS vars).
  - `vector/no-arbitrary-tailwind`: flags `p-[13px]` / `bg-[#fff]`-style
    arbitrary values that dodge the token scales.
- **`eslint.config.mjs`** — severity strategy: both rules WARN in feature code
  (the PostToolUse eslint hook surfaces warnings to agents on every edit, so
  they self-correct without a thousand-error wall) and ERROR in `app/ui/`.
  Plus `no-restricted-syntax` warnings on raw `<button>`/`<input>`/
  `<textarea>`/`<select>` in feature code (app/ui and Menu.js exempt —
  wrapping raw elements is a primitive's job). Current totals: **0 errors,
  187 warnings** — the warnings are the measured retrofit debt, ratcheted by
  the audit script, converted to errors per-directory as Phases 7-8 land.
- **The rules caught a real violation on day one:** `CalendarDropdown.js:78`
  hardcoded the floating shadow value (a lens-6 finding). Fixed to
  `var(--shadow-floating)` — the token from Phase 2 existing is what made the
  fix one line. rawRgba metric: 27 → 26.
- **`.github/workflows/ci.yml`** replaces `unit-tests.yml`: four jobs —
  `lint` (ESLint + design.md spec lint), `test` (vitest), `build` (production
  build with dummy `DATABASE_URL` / Supabase env — verified locally that the
  build needs exactly those three and contacts no service), `audit` (the
  ratchet: any DS-metric regression vs the committed baseline fails CI).
  Triggers include the `design-system` branch. NOTE: unexercised until the
  branch is first pushed — verify the 4 jobs on that first push.

**Verified:** lint 0 errors/187 warnings · Sparkle escape hatch clean · scratch
violation in app/ui produces errors · `tsc` clean · 63/63 tests · build green
with dummy env (no `.env`) · audit ratchet: zero regressions, rawRgba improved.
