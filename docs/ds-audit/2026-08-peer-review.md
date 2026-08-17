# Design system peer review — Vector DS · 2026-08-11

> Commissioned by Caroline ("spin yourself up a design system experienced
> builder friend that can evaluate your work"). Reviewer: a DS-veteran agent
> (Carbon/Polaris-scale stance), read-only pass over app/ui, globals.css, the
> token pipeline, DESIGN.md, Storybook config and the plan/log. Verdict and
> findings verbatim; the twMerge behaviour was verified by running it, not
> guessed. **Status annotations added afterwards in [brackets].**

## Top strengths

1. **The DsMeta system** (ds-meta.ts + 22 colocated meta files) — "dontUseWhen
   names the alternative" and the HONEST GAPS convention are things Carbon and
   Polaris still don't do systematically.
2. **Stories genuinely teach** — play functions assert the a11y wiring, the
   AllVariants grids exist for VRT, the Interactive-playground doctrine
   (Caroline's addition) is exactly right.
3. **The token pipeline earns its keep** — DESIGN.md → @theme + legacy aliases
   with "deliberately NOT emitted" documented at the point of code. The
   margin-reset find was a genuine live-bug catch.
4. **Adoption mechanics** — warn/error lint split, audit ratchet, per-directory
   ratcheting plan: the lens most DS efforts skip, strongest here.
5. **Native-platform bias** — <dialog> for Modal, native <select> kept with
   the rationale written down.

## FIX NOW

1. **`cn()` breaks Button's text variant** — twMerge classifies `text-btn` /
   `text-btn-action` / `text-btn-danger` as competing text-colour utilities
   and keeps only the last (verified: `twMerge('text-btn text-btn-action')` →
   `'text-btn-action'`). Latent in the app, live in Storybook, and every
   Phase 7 text-button retrofit would convert into the broken path. Falsifies
   the Phase 1 "pixel-identical by construction" claim for this variant.
   *[FIXED same day: single-member class groups via extendTailwindMerge in
   cn.ts + cn.test.js regression pin + honest doc comment.]*
2. **Modal scrim-click eats form data on selection drags** — mousedown inside,
   release over backdrop = close. Fix before adoption. *[FIXED: pointerdown
   tracking; close only when press AND release land on the backdrop.]*
3. **Meta cross-references rotted within one phase** — Button/FieldPill metas
   pointed at Menu's old address; Tooltip.meta promised a Phase 5 fix that
   didn't ship; Spinner.meta said 1.5s vs the shipped 2s; DS-LOG's
   storyCoverage parenthetical named the wrong uncovered files. "Docs that lie
   are worse than no docs" is this project's own doctrine. *[FIXED: all swept;
   post-phase meta sweep added to the phase checklist.]*
4. **Tooltip keyboard/focus gap kept slipping** — ~15 lines, no visual change,
   highest-value a11y fix available. *[FIXED: focusable wrapper, focus/blur
   triggers, ESC dismiss, role=tooltip + aria-describedby. Touch remains
   unsupported, meta says so.]*
5. **Drawer hand-rolls its own close button because IconButton bans
   className** — the DS undermining its own primitive; agents copy the nearest
   example. *[FIXED: policy decided — className accepted for LAYOUT ONLY,
   merged via cn; Drawer's close button is now IconButton + the registry's
   PanelCloseIcon.]*

## FINE UNTIL PHASE 7/8 — decide before adoption spreads

6. **`active` / `isActive` / `data-open` / `data-active`: four spellings, two
   meanings** — `active` means "open" on FieldPill/FieldRow/MenuTriggerButton
   but "selected" on MenuOption; IconButton spells it `isActive`; the
   filter-pill CSS contract uses data-open AND data-active for a third split.
   One word per concept (`active` = popover open, `selected` = chosen value),
   renamed BEFORE Phase 7 multiplies call sites. *[OPEN — Caroline's call.]*
7. **Menu is misnamed and its ARIA half-true** — role=listbox value-picker
   called "Menu"; three plausible answers to "I need a dropdown" spread across
   three metas. Short term: a component-chooser table in the docs. When the
   managed-menu change lands: revisit roles and name together (Listbox?).
   *[Partially addressed: Menu explainer MDX + multiselect variant now uses
   role=menu correctly; naming decision OPEN.]*
8. **className/style escape-hatch policy was accidental** — six policies
   across 15 components. Write the doctrine once, make components match.
   *[Policy for IconButton decided (layout-only className); system-wide
   doctrine write-up OPEN.]*
9. **Badge's `filled` boolean should be a variant union; Button's tone/size
   combinations silently no-op** — a discriminated union makes invalid states
   compile errors; do it while Badge has zero adopters and before StatusBadge's
   fold-in needs mint/sky/candy in the union. *[OPEN.]*
10. **Field's cloneElement will hit its ceiling at the first composite
    control** — fine now, well-argued; write the tripwire in Field.meta:
    "switch to context, don't grow cloneElement heuristics". *[OPEN, one line.]*
11. **The three-layer CSS division is real but unwritten** — state machines in
    globals.css classes, layout in utilities, dynamic inline; TabBar/Tooltip/
    FieldPill violate it internally; globals.css mixes DS and feature CSS in
    one 1,360-line scroll. Ten-line "where does CSS go" section + a file split.
    *[OPEN.]*
12. **FieldPill/FieldRow div-with-role** — retrofit to native <button> when
    Phase 7 touches the call sites anyway. *[OPEN, scheduled with Phase 7.]*

## MATTER OF TASTE — Caroline's call

13. Names: FieldPill/FieldRow/TaskIdChip fine; **InlineProse is the weak one**
    (nothing says "AI text with task-ref chips" — AIProse? ProseWithRefs?);
    CalendarDropdown vs DatePicker defensible either way.
14. Spinner's free-pixel `size` vs a sm/md/lg union — either defensible.
15. CompanyAvatar's compat props: mark `@deprecated` in JSDoc.
16. Storybook preview hardcodes two bg hexes — tiny drift vector, low priority.

## Verdict (verbatim)

"This is a design system whose *machinery* — meta manifests, story doctrine,
token pipeline, lint-plus-ratchet enforcement — is genuinely ahead of most
production systems I've seen at far bigger companies, and the honesty
discipline is the rarest and most valuable habit in it. What keeps it from an
A today is execution drift against its own creed: one real rendering bug in
the pattern-setter, meta cross-references that rotted within one phase, a
scrim-click hazard aimed directly at the forms it's about to absorb, and API
conventions that are still accidents rather than decisions — cheap to fix now,
expensive after Phase 7 multiplies the call sites. None of this is structural.
**Grade: B+ — the architecture and intent are A material; ship the fix-now
list before the retrofit and it earns the letter.**"

**[All five FIX NOW items were shipped the same day. Items 6-12 are queued
decisions, most needing Caroline's ruling — see DS-LOG.]**
