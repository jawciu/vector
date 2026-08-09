# DS audit — metrics and method

> **Visual report:** https://claude.ai/code/artifact/e930beb8-5ede-466e-a98d-bb9018fa3f70
> (private to Caroline's claude.ai account; re-published to the same URL after each phase).
> The qualitative lens findings live in `2026-08-lenses.md` next to this file.

`npm run audit:ds` measures how much of the app actually goes through the design
system. It is the executable half of the audit playbook in `docs/DS-PLAN.md`
(Part A): the seven lenses are the method, this scorecard is lenses 1, 2 and 4
turned into numbers. Committed snapshots in this directory are the record of
progress — `2026-08-baseline.json` is the untouched "before" state, captured
prior to any DS work.

## Running it

```bash
npm run audit:ds                                   # scorecard table
npm run audit:ds -- --json                         # machine-readable JSON
npm run audit:ds -- --out docs/ds-audit/foo.json   # write a snapshot
npm run audit:ds -- --baseline docs/ds-audit/2026-08-baseline.json
                                                   # compare + exit 1 on regression
```

The `--baseline` mode is the **ratchet**: CI runs it against the committed
baseline, so any change that makes a metric worse fails the build. The DS can
only move forward. After a retrofit lands, refresh the baseline to the new
floor so the ratchet tightens.

## What each metric means

All patterns are heuristic greps over `app/**` (excluding `app/api/`, which has
no styling, and — since Phase 4 — `*.stories.*` / `*.meta.*` files: stories are
DS documentation scaffolding that never ships in the app bundle, so their
layout styles are not app drift; the raw-hex allowlist tracks `Sparkle.tsx`
post-TS-conversion). "Feature code" means everything outside `app/ui/` — primitives are
*allowed* to use raw elements and SVGs internally; wrapping them is their job.
Coverage metrics always report **count and ratio together** (`18/103 (17%)`):
the ratio says how healthy the system is, the count says how big the clean-up
job is.

### Lens 1 — raw-value leakage (all lower = better)

| Metric | What it counts | Why it matters |
|---|---|---|
| `rawHexTotal` / `rawHexDistinct` | Hex colour literals outside the allowlist (`app/ui/Sparkle.js` — SVG `<stop>` can't resolve CSS vars) | Every raw hex is a colour the token system doesn't know about |
| `rawRgba` | `rgb()`/`rgba()` calls in JS | Same, for the other colour syntax |
| `inlineStyles` | `style={{` objects | The measure of styling that bypasses both Tailwind and the CSS-class layer |
| `arbitraryTw` | Arbitrary Tailwind values (`-[20px]`, `-[#fff]`) | Off-scale values that dodge the token scales |
| `hardcodedGeometry` | Numeric `borderRadius:`/`padding:`/`margin:`/`gap:`/`fontSize:` in style objects | Spacing/radius/type decisions made ad hoc instead of via tokens |

### Lens 2 — primitive coverage (higher ratio = better)

| Metric | Blessed | Raw |
|---|---|---|
| `buttonCoverage` | `<Button>` `<IconButton>` `<MenuTriggerButton>` `<MenuOption>` | `<button>` in feature code |
| `inputCoverage` | `<Input>` `<Textarea>` `<Select>` (none exist yet — starts at 0; add `Field` to the script's list only when `app/ui/Field.tsx` ships, because FollowUpModal + TeamPanel have a *local* `<Field>` that must not count) | `<input>` `<textarea>` `<select>` |
| `iconCoverage` | `<svg>` living inside `app/ui/` | `<svg>` scattered in feature code |

### DS-layer maturity (higher = better)

- `storyCoverage` — `app/ui/` components with a colocated `*.stories.tsx`.
- `tsCoverage` — `app/ui/` components converted to TypeScript.

### Lens 4 — dialog accessibility (lower = better)

- `dialogsMissingA11y` — files with the modal scrim pattern (`fixed inset-0` +
  black rgba) but no `role="dialog"`, `aria-modal`, or native `<dialog>`.
  The baseline caught **5** — one more (`OnboardingActions.js`) than the manual
  audit had found.

## Reusing this elsewhere

The script has no dependencies; the repo-specific parts (scan scope, allowlist,
primitive names) sit in the `SCOPE`/`PRIMITIVE_*` config at the top of
`scripts/audit-ds.mjs`. Point it at another React codebase and tune that block —
the seven-lens method in `docs/DS-PLAN.md` Part A stays the same.

## Baseline (2026-08-08, before any DS work)

15 raw hexes (3 distinct) · 27 rgba · **1,081 inline styles** · 34 arbitrary
values · ~1,000 hardcoded geometry props · buttons **55/143 (38.5%)** · inputs
**0/39 (0%)** · icons 12/112 (10.7%) · stories 0/14 · TypeScript 0/14 ·
**5 modal shells with zero dialog semantics**.
