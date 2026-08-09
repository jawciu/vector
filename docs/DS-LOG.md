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
  generated and committed (Next convention).
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
