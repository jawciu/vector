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

---

## Phase 4 — Storybook · 2026-08-09

**What:** the DS's contract surface. All 14 primitives storied, 11 converted
to TypeScript, the meta-manifest system live.

- **Storybook 10.5.7** on `@storybook/nextjs-vite` (explicit Next 16 support;
  the app's `--webpack` flag is irrelevant, SB's Vite builder is independent).
  Addons: docs (autodocs from TS types), a11y (`test: "error"` — serious
  violations fail), pseudo-states. `.storybook/preview.tsx` imports the real
  `app/globals.css` (Tailwind + generated tokens), renders on the real dark
  bg, maps the Geist font vars. `npm run storybook` / `build-storybook`, both
  pre-running `build:ds`. `storybook-static/` gitignored.
- **74 stories + 14 autodocs pages across all 14 primitives** (Button 15 ·
  IconButton 7 · FieldPill/FieldRow 6 each · TabBar 6 · Drawer 6 · InsightCard
  6 · CalendarDropdown 5 · Tooltip 4 · CompanyAvatar 4 · InlineProse 3 ·
  Sparkle 2 · TaskIdChip 2 · Icons 2, incl. an auto-generated all-icons grid).
  Doctrine encoded: named story per blessed state, pseudo hover/focus stories,
  play functions asserting behaviour (ESC closes Drawer, day-click fires
  onChange, disabled blocks clicks, loading sets aria-busy + preserves width),
  AllVariants grids for future VRT, realistic content copied from real call
  sites. Stories document what EXISTS — known gaps stay visible (e.g. Drawer's
  `ClosedChildrenStillMounted` play PINS the tab-stop leak until Phase 5 fixes
  it and must then be updated).
- **DsMeta system**: `app/ui/ds-meta.ts` schema (status / useWhen /
  dontUseWhen / a11y / tokens) + `dsMetaDescription()` rendered into each
  autodocs page (simplification vs the plan's custom DocBlock — same content,
  less machinery). All 14 primitives have `<Name>.meta.ts` with honest a11y
  gap notes matching the lens-3 matrix. Deferred: the ds-manifest.json
  aggregation script (agents can grep `*.meta.ts` directly; revisit in
  Phase 6/9 if a single JSON surface earns its keep).
- **TS conversions (byte-identical DOM)**: IconButton (aria-label now REQUIRED
  by type), Sparkle, TaskIdChip, InlineProse, CompanyAvatar (name required),
  Tooltip, FieldPill, FieldRow, TabBar, Icons (+ Button from Phase 1) = 11/14.
  Still JS: Drawer, CalendarDropdown, InsightCard (complex; Phase 5 converts
  as it touches them). Their stories carry typed casts to be deleted then.
- **New findings from story-writing** (Phase 5 fix list): hovering the ACTIVE
  tab dims it (`.tab-btn:hover` specificity order, globals.css); Calendar
  month prev/next buttons have NO accessible name (critical axe hit — its
  stories carry `a11y: { test: "todo" }` with a comment); Drawer has an
  undocumented `background` prop.
- **Audit script updated** (metric-definition change, documented in
  ds-audit/README): stories/meta files are DS scaffolding excluded from drift
  metrics; allowlist tracks Sparkle.tsx. The ratchet CAUGHT both staleness
  issues itself (4 false regressions) before the fix — working as designed.

**Verified:** `build-storybook` green, index.json = 74 stories / 14 docs /
14 components · `tsc --noEmit` clean · lint 0 errors · 63/63 tests · audit
ratchet zero regressions with storyCoverage 0→100%, tsCoverage 0→78.6%.

**Caroline's review addition (2026-08-09): `Interactive` playground stories.**
Her call after reviewing: frozen single-state stories are right for docs/VRT,
but stateful components must ALSO ship one stateful playground where the full
lifecycle works by hand. Added to Drawer (button opens; chevron/ESC/outside
click genuinely close) and CalendarDropdown (starts COLLAPSED like the real
field; click opens, picking closes). Both `tags: ["no-vrt"]`. **Doctrine going
forward: every stateful primitive gets an Interactive story** (Modal + Menu in
Phase 5 must ship with one). Now 76 stories.

---

## Phase 5 — New primitives + pinned-gap fixes · 2026-08-11

**What:** the eight missing primitives exist, and the four gaps Phase 4's
stories pinned are fixed. NOTHING is adopted by feature code yet — every new
visual awaits Caroline's Storybook review (her rule: no screenshots/baselines
until she approves everything).

**New primitives** (all TSX + stories + meta + Interactive playgrounds):
- **`Modal.tsx`** (experimental) — native `<dialog>` + `showModal()`: browser
  focus trap, ESC, implicit dialog semantics, `::backdrop` painted with the
  scrim token. Required `title` → aria-labelledby. Sizes sm/md/lg. Radius
  12px per the documented scale (legacy modals are 20px; converge Phase 7).
  9 stories incl. DestructiveConfirm recipe + FocusContainment play.
- **`Field.tsx` + `Input.tsx` + `Textarea.tsx` + `Select.tsx`** (experimental)
  — Field owns label/help/error + id/aria wiring (cloneElement; error id in
  both aria-errormessage AND aria-describedby for AT compat). `.input` CSS in
  globals.css derived from `.search-input` but ON-SCALE where the hand-rolled
  inputs drifted (14px text not 13, 8/12px padding, rounded-lg 8px). 20
  stories. **NEW VISUALS pending Caroline: input focus style (action border)
  and per-field invalid state (danger border holding through focus + inline
  error copy — the app currently only does form-top banners).**
- **`Spinner.tsx`** (stable — visual already shipped inside Button) — wraps
  `.btn-spinner`, size via fontSize (the class is 1em-based), role="status"
  when labelled. **`Badge.tsx`** (experimental) — generalises `.status-pill`;
  closed colour union mapping to token UTILITY classes (text-*/bg-*), not
  inline vars. StatusBadge.js untouched until Phase 7.
- **Menu moved into the DS layer**: `app/ui/Menu.tsx` (typed, byte-identical
  output — deliberately NOT cn(), to preserve exact class strings);
  `app/components/Menu.js` is now a 4-line re-export shim, 14 consumers
  unchanged, `npm run build` proves it. 6 stories. Keyboard model (arrows/
  ESC/aria-expanded) deliberately NOT added — separate reviewed change,
  honestly documented in Menu.meta.ts.

**Pinned gaps fixed** (each story that pinned a gap now pins the fix):
- Drawer: `inert` when closed — tab-stop leak dead; ClosedChildrenStillMounted
  → `ClosedPanelIsInert`. (No focus trap yet; still documented.)
- CalendarDropdown: month arrows labelled ("Previous/Next month"), a11y todo
  removed, MonthNavigation selects by accessible name.
- TabBar: active tab no longer dims on hover
  (`.tab-btn:not([data-active]):hover`).
- FieldPill/FieldRow: keyboard-operable (role="button", tabIndex, Enter/Space
  via synthesized click so inner clear-buttons don't double-fire) + **NEW
  VISUAL pending Caroline: focus ring on field editors** (--focus-ring, same
  shape as the shared button rule).

**Found during the work:** PortalDrawer hand-rolls its own `.task-drawer`
panel (doesn't use the primitive) so it STILL leaks tab stops — added to the
Phase 7 retrofit list.

**Audit note:** inlineStyles sits at 1083 vs the 1081 baseline: +1 Spinner
(dynamic numeric fontSize — legitimately inline) and +1 net from Menu's
byte-identical move. Both justified; the committed baseline gets refreshed to
this floor WITH Caroline's phase approval, not before. The ratchet also caught
Modal/Badge initially using inline `var()`s — both were rewritten onto the
token utilities (the DS layer must exemplify its own front door).

**Verified:** tsc clean · eslint app/ui 0 errors/warnings · repo lint 0 errors
· 63/63 tests · `npm run build` green (Menu shim safe) · build-storybook green:
119 stories / 20 docs pages / 22 ui components, storyCoverage 90.9%,
tsCoverage 86.4% · no screenshots taken. (A parenthetical here previously
misnamed the uncovered story files — the actual gap was Select/Textarea, since
closed. Caught by the 2026-08-11 peer review, finding 3.)

---

## Review round 1 — Caroline's 23-point Storybook review · 2026-08-11

**What:** her full review of Phases 4-5 in Storybook, turned into fixes, new
primitives, Foundations docs, an icon sweep, and a commissioned peer review.
Still NO screenshots/baselines — everything awaits her re-review in Storybook.

**Her rulings applied directly:** loading buttons keep the ACTIVE colour
(primary→action-active, destructive→danger-active, cursor:progress) ·
spinner slowed 0.6s→1s (reduced-motion 2s) and standalone default is action
lilac · Modal has a built-in X close (IconButton + CloseIcon, closeButton
prop default true) · Badge gained size sm 12px/500 · md 14px/400 — the 14px
"product badge" she spotted was InsightCard's inline override of the 12px
class, now formalised as a variant.

**Her review found a Storybook-addon BUG:** storybook-addon-pseudo-states
leaks `parameters.pseudo` into GLOBALS on story view and never clears it, so
after visiting any Hover/Focus story, every later story of every component
renders hovered/focused. This explained "AllVariants is in focus state",
"default looks the same as hover", and IconButton's phantom resting
background. Fixed with a `withPseudoGlobalsReset` decorator in
.storybook/preview.tsx (upstream diagnosis documented in the code).

**Story revamps:** FieldPill/FieldRow (one canonical content across all
states, Default(filled)/Empty/Hover/Active/FocusVisible), IconButton
(HoverVsActive comparison, NEW danger tone pending review), TabBar
(Interactive playground), Tooltip (Open story first; docs previews now
iframe so the open tip is visible — play functions never run inline),
behaviour tests renamed "… (test)" with explanations. Menu gained
`checked`/`multiselect` (checkbox dropdown variant, pending review; uses
role=menu for the multiselect case — the briefed listbox+menuitemcheckbox
combination is invalid ARIA and was corrected).

**Icon sweep:** registry 7 → 36 (all her named icons harvested from feature
code; three competing X glyphs and two searches deduped with decisions
recorded; CheckSquare's baked lilac → currentColor). Stories: Generic/AI
grids (Sparkle co-presented per her ruling) + an InheritedColor strip
demonstrating the rule she asked about: icon colour is ALWAYS inherited from
the parent via currentColor, never a prop.

**Form family:** Input → **TextField** (her naming; `.input` CSS class name
kept, flagged as separate decision) · Textarea + Select got their own story
files · NEW: SearchField (from the shipped search boxes; clear-X is new,
flagged) · Checkbox (from the member-picker; unchecked border is
iconTertiary — the shipped hex IS that token) · TaskTick (the task-complete
circle, bounce animation self-guarded for reduced motion). Her investigation
answered: the app has TWO input species — boxed (settings/search → TextField)
and borderless-inline (task title, drawer fields → future InlineTextField,
awaiting her naming).

**Foundations section (top of sidebar):** Colours (swatches painted from
var(--color-*), drift-proof) · Typography · Spacing & radius · Motion (live
bezier plot) · **Voice & copy — NO EM DASHES EVER**, sentence case, British
spelling, operator tone · plus the Menu explainer MDX. Five NEW DESIGN.md
ambiguities surfaced for Caroline (stale `warning` prose, "no formal scale
yet" contradiction, overclaimed motion rule, duration-token survival plan,
Geist Mono unregistered).

**Commissioned peer review** (`docs/ds-audit/2026-08-peer-review.md`):
**grade B+** — machinery "ahead of most production systems", five FIX NOW
findings, ALL FIXED same day: (1) cn()/tailwind-merge was EATING Button's
.text-btn base class — a real rendering bug in the pattern-setter; fixed via
registered class groups + cn.test.js regression pin (the DS's first unit
test, suite now 66); (2) Modal scrim-click ate form data on selection drags —
fixed via pointerdown tracking; (3) meta rot swept; (4) Tooltip keyboard
support shipped (focus/blur/ESC/aria-describedby); (5) IconButton className
policy decided (layout-only, cn-merged) and Drawer's hand-rolled close button
replaced with IconButton + PanelCloseIcon. OPEN review items for Caroline:
active/selected naming unification, Badge variant union, className doctrine
write-up, CSS-layer split, InlineProse rename, div→button for Field editors
(Phase 7).

**Audit floor note:** the new primitives' faithful internal styles put
inlineStyles at 1091 / hardcodedGeometry at 1007 vs the 1083/1000 ratchet
floor (+ the CSS-layer question is peer-review item 11, open). Ratchet
baseline refreshes with her approval of this round, as before.

**Verified:** tsc clean · eslint app/ui + .storybook 0 errors/warnings ·
66/66 tests · build green · build-storybook green: **176 stories / 31 docs
pages / 25 components · storyCoverage 100% · tsCoverage 88%**.
