---
name: Vector
version: 0.1.0
description: Design system for Vector — a B2B onboarding workflow tool.
colors:
  # Spec-convention alias: design.md lint requires a `primary`; ours is the
  # action ramp's default. Not used directly in app code — use `action`.
  primary: "{colors.action}"

  # Surfaces — vertical stacking by elevation
  deeperBg: "#14141A"           # Recessed surface — slightly darker than bg (drawers, etc.)
  bg: "#18181E"                 # Page / app background (lowest)
  bgElevated: "#1D1C24"         # Elevated surfaces — cards, modals, kanban task cards
  bgElevatedHover: "#232028"    # Hover on bg-elevated surfaces
  bgHover: "#211F29"            # Hover on transparent / bg surfaces — menu rows, links
  surface: "#1F1E26"            # Interactive surface — buttons, inputs, pills
  surfaceHover: "#26242F"       # Active/selected state on surfaces

  # Borders
  border: "#25232D"             # Default borders
  borderSubtle: "#25232D"       # Lower-emphasis borders (currently same as border)

  # Text
  text: "#F1EAF1"               # Primary text on dark backgrounds
  textSecondary: "#CAC7CA"      # Secondary text — hover state on nav, paragraph body
  textMuted: "#999599"          # Tertiary text — labels, placeholder, inactive nav
  textDark: "#18181E"           # Text on bright backgrounds (avatars, primary buttons)

  # Action — primary brand colour (lilac purple)
  action: "#C098FF"             # Primary button default
  actionHover: "#D3B5FF"        # Primary button hover
  actionActive: "#9E6CEE"       # Primary button pressed
  actionDisabled: "#604C80"     # Primary button disabled
  actionText: "#18181E"         # Text on action backgrounds

  # Status
  success: "#9CFFA6"            # Success — completion, positive state
  danger: "#FF899B"             # Destructive — delete, error
  dangerHover: "#FFB0BC"        # Destructive hover
  dangerActive: "#E5677B"       # Destructive pressed
  dangerDisabled: "#80444E"     # Destructive disabled
  alert: "#FFDA91"              # Warning, caution

  # Focus
  focusRing: "{colors.action}"  # Outline colour for :focus-visible on interactive elements

  # Accent / utility
  accent: "#22D3EE"             # Cyan accent (rare use)
  iconTertiary: "#5D565D"       # Disabled / placeholder icon

  # Avatar / badge palette (rotates by initials hash)
  mint: "#9DFFF4"
  rose: "#D8A7FF"
  sunset: "#FFA673"
  lilac: "#B3A5FF"
  sky: "#85C0FF"
  candy: "#FF9EE5"

  # AI gradient — used for the Vector sparkle, AI-section dividers, and any
  # surface marking output as AI-generated. Pair `aiGradientFrom` (= action lilac)
  # with `aiGradientTo` (warm peach) at a 135deg sweep.
  aiGradientFrom: "{colors.action}"
  aiGradientTo: "#FF9C7D"

  # Component-level
  buttonSecondaryBorder: "#2E2C38"

typography:
  fontFamily:
    sans: "var(--font-geist-sans), system-ui, sans-serif"
  # The type scale, expressed as the Tailwind utilities in use. Every rung
  # equals Tailwind v4's default, so text-xs…text-xl ARE the scale at runtime
  # and no --text-* overrides need emitting. (xl was proposed at 22px; Caroline
  # ruled 20px, 2026-08-09 — matches Tailwind and the existing login heading.)
  scale:
    xs: 12px     # text-xs — chips, metadata
    sm: 14px     # text-sm — default UI size, body
    base: 16px   # text-base — emphasised body
    lg: 18px     # text-lg — panel titles
    xl: 20px     # text-xl — page/dialog headings (login "Sign in")
  smallLabel:
    fontSize: 11px
    textTransform: uppercase
    letterSpacing: "0.6px"

spacing:
  # Tailwind v4 default scale is in use; these are the values we lean on most.
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px

rounded:
  # Aligned to Tailwind v4's default radius scale (Caroline's ruling
  # 2026-08-09): the rung names match the utilities, the utilities in use ARE
  # the scale at runtime, and no --radius-* overrides are emitted. (The old
  # doc-only values — lg 10px etc. — never rendered anywhere.)
  sm: 4px      # `rounded` / `rounded-sm` — pills, small badges, IconButton
  md: 6px      # `rounded-md` — status badges, menu options
  lg: 8px      # `rounded-lg` — buttons, inputs
  xl: 12px     # `rounded-xl` — floating surfaces (bulk action bar)
  full: 9999px # `rounded-full` — avatar circles ONLY

# Custom section (not part of the design.md spec, which is hex-only for
# colors): translucent overlay colours. Emitted to @theme by build-theme.mjs.
overlays:
  scrim: "rgba(0, 0, 0, 0.6)"   # Modal / dialog backdrop (60% black)

shadows:
  # Currently we use almost no shadows — depth comes from bg layering.
  # The exception is the bulk action bar which floats over content.
  floating: "0 8px 24px rgba(0, 0, 0, 0.4)"

motion:
  # All hover/active transitions use this curve.
  ease: "cubic-bezier(0.4, 0, 0.2, 1)"
  durationFast: "0.15s"
  durationMedium: "0.25s"
---

# Vector design system

A dark-first design system for a B2B onboarding workflow tool. Tone: clear, operator-focused, minimal chrome, action-led. Built on **Tailwind CSS v4** with a CSS-first `@theme` config: this file is the source of truth, `scripts/build-theme.mjs` generates `app/theme.css` from it (an `@theme` block registering every token as a utility class — `bg-action`, `text-muted`, `shadow-floating` — plus legacy `:root` aliases for the migration), and `globals.css` imports it and holds the component CSS.

The system is deliberately **incremental** — Caroline adds primitives to the DS only when a pattern earns it. Don't pre-extract.

## Overview

Three layers:

1. **Surfaces** stack vertically by elevation: `bg` (page) → `bgElevated` (cards) → `surface` (interactive). Hover states bump one rung up: `bg → bgHover`, `bgElevated → bgElevatedHover`, `surface → surfaceHover`. Active/selected always lands on `surfaceHover` regardless of base.
2. **Text** has three weights of emphasis: `text` (primary), `textSecondary` (paragraph body, hover-on-nav), `textMuted` (labels, inactive). Going from `textMuted` straight to `text` on hover reads as "selected" — use `textSecondary` for the hover step on navigation-like surfaces.
3. **Action** is a single warm-purple ramp (`action / actionHover / actionActive / actionDisabled`). Status colours (`success / danger / alert / warning`) are reserved for state, not decoration.

## Colors

### Semantic (use these by default)

- **Backgrounds**: `bg` for the page, `bgElevated` for raised surfaces (kanban cards, modals), `surface` for interactive (buttons, inputs, pills).
- **Hover progressions**:
  - Transparent / `bg` → `bgHover` (menu rows, links over the page)
  - `bgElevated` → `bgElevatedHover` (kanban card hover)
  - `surface` → `surfaceHover` (also doubles as "active/selected")
- **Text**: `text` is the primary. `textSecondary` is the *hover step from muted*. `textMuted` is the resting state for inactive UI.
- **Borders**: `border` is default; `borderSubtle` exists as a hook for future lower-emphasis dividers (currently same value).

### Action

Single brand purple ramp:
- `action` — default state (primary button, links to actions)
- `actionHover` — subtle lighten on hover
- `actionActive` — darken when pressed
- `actionDisabled` — desaturated muted state
- `actionText` — text colour for content sitting on `action` (buttons mostly)

### Status

Reserved for state. Don't decorate with these.
- `success` — completion (✓ wins, "Done" tags)
- `danger` — destructive (delete, error states, blocked tasks)
- `alert` — warning ("At risk")
- `warning` — amber for notifications / badges (lighter touch than `alert`)

### Avatar palette

`mint / rose / sunset / lilac / sky / candy` rotate by initials hash. Only used for avatar / company-initial pills. Never for status or action.

## Typography

Currently expressed inline via Tailwind utility classes (`text-xs` / `text-sm` / `text-base` / `font-semibold` etc.) — there is **no formal scale yet**. Body sits at `text-sm` (14px) line-height 1.5. Small labels use 11px uppercase with 0.6px letter-spacing for section headers (e.g. card titles in InsightsPanel).

When the scale is formalised, the planned ramp is `xs / sm / base / lg / xl` mapped to `12 / 14 / 16 / 18 / 22 px`.

## Layout

Tailwind v4 default spacing scale is used directly. Most surfaces converge on these:
- `padding: 12px` (sm), `16px` (md), `20–24px` (lg) — cards / panels
- `gap: 4px` between menu items, `8–12px` between cards
- `gap: 24px` between major sections in a grid

No formal grid system. The home page uses a 7-column CSS grid with explicit widths; the onboarding board is a flex row of fixed-width Kanban columns (240px).

## Elevation & depth

Depth is communicated by **background colour layering**, not shadows. The only shadow currently in the system is the `floating` token used by the bulk action bar (`.bulk-action-bar`).

## Shapes

| Use | Token | Notes |
|---|---|---|
| Avatars / initials circles | `rounded.full` | The **only** place `rounded-full` is correct |
| IconButton | `rounded.sm` (`4px`) | **Always `rounded`, never `rounded-full`** |
| Pills, status badges | `rounded.sm` / `rounded.md` | |
| Inputs, buttons | `rounded.lg` (`8px`) | |
| Cards, hero panels | 20px (bespoke) | InsightsPanel cards (`.oi-card`), PortfolioInsightsHero (`.pi-card`) — the one radius outside the scale |
| Bulk action bar, modals | `rounded.xl` | Floating surfaces |

## Components

### `Button` — `app/ui/Button.tsx`

Variants: `primary` | `secondary` | `tertiary` | `destructive`. Sizes: `xs` | `sm` (default). Solid variants share `rounded-lg` (8px) and `gap-2` (8px) between leading icon and label.
- **Primary**: `font-semibold`, uses `.btn-primary` CSS class. Default `action`, hover `actionHover`, active `actionActive`, disabled `actionDisabled`. Text always `actionText`.
- **Secondary**: `font-normal`, uses `.btn-secondary` CSS class. `surface` background, `border` border, `text` colour. Hover `surfaceHover`, active `bgHover`. Disabled keeps the border but text becomes `textMuted`.
- **Tertiary**: `font-normal`, uses `.btn-tertiary` CSS class. No fill and no visible border — the label alone. Rests at `textMuted` (the same tone as an inactive tab label) and brightens to `text` on hover. **It never takes a background, on hover or otherwise.** Carries a transparent 1px border so its box matches an adjacent secondary and a button row doesn't shift. Disabled stays `textMuted`. `tone="danger"` (`.btn-tertiary--danger`) turns the label `danger`, `dangerHover` on hover, for inline low-emphasis destructive actions such as Revoke. `tone` exists only on tertiary; the type forbids it on the other variants.
- **Destructive**: `font-semibold`, uses `.btn-destructive` CSS class. Default `danger`, hover `dangerHover`, active `dangerActive`, disabled `dangerDisabled`. Text always `textDark`. Use only for irreversible actions as the solid, confirming button (delete, the confirm step of a revoke). An inline revoke in a table row is tertiary `tone="danger"`, not destructive.

**Emphasis is a three-tier ladder: primary > secondary > tertiary.** There is no "ghost" — tertiary *is* the ghost. Inline cancel/dismiss alongside another button uses `variant="tertiary"` at the same size. **Modal footers are the exception (Caroline, 2026-09-12): Cancel is `secondary` there**, so the two footer buttons read as a pair. A per-card `Dismiss` that rejects a draft stays neutral tertiary on purpose: it is a low-stakes, reversible-by-regenerating action, not a delete.

**Only one primary per page or page section.** A filled button that repeats — one per row down a list — carries no hierarchy, because if every row shouts, no row is louder. Worse, it steals the distinction from the page's real primary action. So for **repeated row-level actions in a list or table, use secondary for the accept action and tertiary for everything else**, and reserve the single primary for a page-level action (a header CTA, a bulk "Approve all"), or for the primary action inside a modal/drawer flow. The AI draft inbox (`AIDraftInbox.js`) is the reference implementation: zero primaries, `Create task` / `Comment` / `Approve` are secondary, `Dismiss` / `Edit task` / `Open in mail` are tertiary. This follows IBM Carbon ("only one primary button per page"; "for data lists… low emphasis buttons may be a better choice") and Atlassian ("primary buttons should only appear once per area").

Don't hide row actions behind hover. Reveal *emphasis*, not *existence* — render them muted and strengthen on hover, so they stay discoverable by keyboard and on touch.

All button variants share a `:focus-visible` outline (`2px solid focusRing`, `2px` offset). De-emphasising a button must never cost it a focus ring.

### `IconButton` — `app/ui/IconButton.js`

Small square icon-only controls (meatball menus, plus icons, close buttons, icon-only download links). Two sizes: `sm` (default) is a 20×20px box with a 14px glyph and is used everywhere; `md` is a 28×28px box with a 16px glyph, for the header notification bells. `rounded` (NOT `rounded-full`). Uses `.icon-btn` CSS class. Add `isActive` while the menu it controls is open — applies `.icon-btn--active` (`surfaceHover` background + full `text` colour). Disabled state suppresses hover and dims to `iconTertiary`.

**An icon-only LINK is this component too:** pass `href` and it renders an `<a>` with the identical skin, `aria-label` and `tone`, forwarding `download` / `target` / `rel`. Never hand-copy the `.icon-btn` class string onto an `<a>` (the `vector/no-raw-icon-button` rule reports it). The props are a discriminated union, so button-only attributes cannot leak onto the anchor and vice versa.

Inner SVGs come from the icon registry (`app/ui/Icons.tsx`) in `currentColor`, never a fresh inline SVG at the call site. They render at 14px in `sm` and 16px in `md`; the two notification bells are `md`.

**Never pass `style={{ background: "none", border: "none" }}` to an IconButton.** Inline styles beat `.icon-btn:hover`, so the button silently loses its hover fill; `.icon-btn` already sets its own background and border. `className` is for layout only (see the component's JSDoc).

**A control that opens a menu carries `aria-haspopup` and `aria-expanded`** alongside its lit state (`isActive` on IconButton, `active` on FieldPill / FieldRow, which set both for you from `active` and a `popup` prop) — the visual active state and the announced one have to agree. `aria-haspopup` is `"menu"` by default, `"dialog"` for a date picker, `"listbox"` for a value list.

### Menu primitives — `app/components/Menu.js`

To be migrated to `app/ui/dropdown/` when DS formalises.

- **`MenuTriggerButton`** — styled trigger for opening menus
- **`MenuList`** — absolutely-positioned dropdown container. `padding: 4px`, `flex flex-col gap-1`, `rounded-lg`, `border`, `bg` background, `border` border.
- **`MenuOption`** — menu row. `rounded`, padding `4px 8px`. Hover via `.menu-option` (`bgHover`), active via `.menu-option-active` (`surfaceHover`).

**Every dropdown / popover MUST use `MenuList` + `MenuOption`.** This guarantees the consistent 4px container padding, 4px row gap, hover/active states, and border.

### Search input — `.search-input`

Text-search field. Apply the class to the wrapper that holds the magnifier icon + `<input>`; the inner `<input>` stays border-less / background-transparent so the wrapper drives all visual states.

| State           | Background    | Border                       |
|-----------------|---------------|------------------------------|
| default         | `bg`          | `border`                     |
| hover           | `bg-hover`    | `buttonSecondaryBorder`      |
| focus (within)  | `bg`          | `action`                     |

```jsx
<div className="search-input" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10 }}>
  <SearchIcon />
  <input style={{ border: "none", background: "transparent", outline: "none", flex: 1 }} />
</div>
```

### Filter pill — `.filter-pill`

Pill-shaped trigger that opens a popover (date picker, status filter, etc.). The class drives default/hover/focus and two data-attribute states.

| State / attribute       | Background       | Border                       | Text       |
|-------------------------|------------------|------------------------------|------------|
| default                 | `bg`             | `border`                     | —          |
| hover                   | `bg-hover`       | `buttonSecondaryBorder`      | —          |
| focus-visible           | unchanged        | `action`                     | —          |
| `data-open="true"`      | `surfaceHover`   | `buttonSecondaryBorder`      | `text`     |
| `data-active="true"`    | unchanged        | `action`                     | —          |

`data-open` is the *popover is open* state (matches `.menu-trigger-pill` active look). `data-active` is the *a value is picked* state — they're independent and can stack.

```jsx
<button
  className="rounded-lg filter-pill"
  data-open={open ? "true" : undefined}
  data-active={value ? "true" : undefined}
  onClick={() => setOpen((o) => !o)}
>
  <CalendarIcon />
  <span>{label ?? "Any date"}</span>
</button>
```

### Status pill — `Badge` (`app/ui/Badge.tsx`)

Small cased label communicating state. `Badge` is the only status pill in the DS (2026-09-11). Two variants:

- **Outlined** (default): transparent background, 0.5px border and text in the colour. Two sizes: **md** 14px/20px, `padding: 2px 4px` (the kanban card chip, default) and **sm** 12px/16px, `padding: 1px 4px` (the task drawer status picker). Weight 400, `rounded.md` (6px).
- **Filled**: the colour fills the pill, text in `textDark`. One size, md, the board header blocked-count pill and the AI trend pill. Same proportions as outlined md.

Colour comes from one of three props, never two: `color` (the closed union `success` / `danger` / `alert` / `action` / `muted` / `mint` / `sky` / `candy`), `status` (a task status; Badge owns the mapping: Not started → `muted`, In progress → `mint`, Under investigation → `sky`, On hold → `candy`, Blocked → `danger`, Done → `success`) or `health` (a `computeHealth` state: On track → `success`, At risk → `alert`, Blocked → `danger`). Call sites never re-derive status colours.

**Health is outlined, trend is filled.** Computed health (`lib/health.js`) renders
as an OUTLINED badge everywhere it appears: the workspace list Status column, the
board header, the AI card headers. The AI trend pill is FILLED and carries an
arrow, on the same three colours. Fill plus arrow is the whole difference, so
never fill a health pill and never un-fill a trend pill. In an AI card header the
two sit together, health first then trend, 8px apart, so it is plain they are two
different signals. (The board header's red blocked-COUNT pill stays filled: it is
a count, not a health state.)

The CSS classes (`.status-pill`, `--filled`, `--md`, `--sm`) stay for the hand-rolled pills until Phase 7 retrofits them: the task status chips in `TaskCardView`, `TaskDrawer`, `PortalTaskCard`, `AIDraftInbox` and `CreateTaskModal`, `InsightStatusPill`, the list's health pill and the board header blocked pill. `.status-pill--insight` / `--trend` / `.oi-header-pills` carry the insight pills' layout.

Insight trend → token mapping (used by the vendor AI pill, onboarding and portfolio).
The AI pill states the direction of travel only. Health (`On track` / `At risk` /
`Blocked`) is computed by `lib/health.js` and has its own pills, so the two
vocabularies never overlap. The COLOURS are shared on purpose, since green /
amber / red already mean good, watch, bad here and a second ramp for the same
ideas read as noise; the arrow is what separates the two pill families:
- `improving` → `success` (arrow up-right)
- `steady` → `alert` (arrow flat)
- `declining` → `danger` (arrow down-right)

### AI surface treatment

When marking output as AI-generated (the Vector sparkle, AI section dividers inside an AI card, hover highlights on AI-actionable items), use the gradient:

```css
background: linear-gradient(135deg, var(--ai-gradient-from), var(--ai-gradient-to));
```

For SVG fills the gradient must be inlined as a `<linearGradient>` referencing the two stops. The Vector sparkle is fixed at **16×16** with the gradient applied as the icon fill.

### AI generating state — `.ai-generating` + `.is-streaming`

The visual cue Vector uses to say *"I'm producing content right now"*. Apply `.ai-generating` to any positioned card that already has a `border-radius`, then toggle `.is-streaming` on while the underlying request is in flight. The card grows a slow-rotating conic-gradient border on a masked `::after` pseudo-element. Crossfades in over 2s and out over 2s when the class drops.

Used by:
- `InsightCard` (portfolio + onboarding overview) while regenerating insights — already wired via the `pi-card` / `oi-card` classes.
- The unmatched-meeting card on `/ai-drafts` while the orchestrator is producing drafts.

```jsx
<div className={`ai-generating${isStreaming ? " is-streaming" : ""}`} style={{ borderRadius: 20 }}>
  …content…
</div>
```

Honors `prefers-reduced-motion: reduce` — the spin pauses, the fade still plays.

### AI sparkle twinkle — `.ai-sparkle-twinkle`

Apply to the Vector sparkle SVG while Vector is thinking. The icon spins 360° on its own axis with an ease-in (slow start, fast finish), pauses for a beat at the end of the rotation, then loops. Used in place of a spinning loader during AI generating states (e.g. `InlineEventDrafts` while the orchestrator runs). More on-brand than a generic spinner.

```jsx
<span className="ai-sparkle-twinkle" style={{ display: "inline-flex" }}>
  <VectorSparkleSvg />
</span>
```

### AI text shimmer — `.ai-text-shimmer`

Apply to a text node next to `.ai-sparkle-twinkle` while Vector is generating. Standard Vercel/Apple-style pattern: a 3-stop gradient (`textMuted` → `aiGradientFrom` → `textMuted`) sits on the text via `background-clip: text` with `background-size: 200%`, then loops `background-position` from `200%` to `0%`. The default `background-repeat: repeat` lets the gradient tile, so the lilac peak slides through the text continuously and seamlessly. No overlay, no `data-text`, no transparent edges.

```jsx
<span className="ai-text-shimmer">Generating action draft…</span>
```

Honors `prefers-reduced-motion: reduce` — animation off, text reverts to a flat `textSecondary`.

### TabBar — `app/ui/TabBar.js`

Underline-as-selection pattern. Inactive tabs are `textMuted`, hover bumps to `textSecondary` (NOT to `text`), active tabs are `text` with a 2px underline indicator in `action` (lilac). **No background pill** on hover — the underline is the only "selected" cue, doubling up reads as redundantly selected.

### Insight card primitives — `app/ui/InsightCard.js`

The visual language for AI-generated panels. Used by both the vendor onboarding overview (`InsightsPanel`) and the customer portal overview (`PortalOverview`) so the two surfaces feel like the same product.

- **`InsightCard`** — outer shell. 20px radius (bespoke — outside the `rounded` scale, whose `xl` is 12px; alignment pending the radius decision in Future plans), 1px `buttonSecondaryBorder`, `bg` background, `container-type: inline-size` so the section grid (`oi-row`) reflows at 1100px / 720px breakpoints. Pass `isStreaming` to enable the gradient sweep border animation (`.is-streaming`).
- **`InsightCardHeader`** — `padding 16/16/12`. Slots: `title` (uppercase 16px label after the Vector sparkle), `healthPill` then `statusPill` (rendered next to the title in a `.oi-header-pills` row, 8px apart: outlined health, then filled trend; while streaming the header hides `statusPill`, since the trend shown would be the previous answer, and "regenerating…" takes its place), `onRegenerate` (the `↻` icon button on the right). Disables the regenerate button while streaming.
- **`InsightDivider`** — 1px `borderSubtle` rule; sits between header and the first row, and between rows.
- **`InsightSection`** — section wrapper. Title is 14px semibold uppercase `textMuted` letter-spacing 0.5px, followed by an `.ai-divider` (the AI-gradient hairline). Section grid placement is controlled by classes `oi-section--{summary|risks|wins|focus|week}` defined in `globals.css`.
- **`InsightStatusPill`** — `audience="vendor"` (default) renders a TREND: a `TrendArrowIcon` (up-right / flat / down-right) then the word, 4px apart, `improving`/`steady`/`declining` → `success`/`alert`/`danger`, the same three colours as health. Hidden text supplies the `Trend: ` prefix so the accessible name stays unambiguous. Legacy cached values are mapped on the way in (`Declining`→declining, `Improving`→improving, `At risk`→declining, `On track`→steady) by `normaliseTrend` in `lib/insight-trend.js`, silently. `audience="customer"` maps `On track`/`Needs your input`/`In progress` → `success`/`alert`/`mint`. Both render as `.status-pill--filled` today; Phase 7 folds them onto `Badge` filled.
- **`WinRow`** — single win, green `CheckCircle` + headline + muted detail. Use the `position` prop (`top`/`middle`/`bottom`/`only`) to round corners when stacking multiple rows into a single bordered group.
- **`ThisWeekRow`** — single weekly priority, `PriorityIcon` + summary text. Same `position` API as `WinRow`.
- **`RiskCard`** — vendor only. Severity pill on top (`high`/`medium`/`low` → `danger`/`alert`/`textMuted`) with the risk summary below. Stacks horizontally with `position` for shared rounded corners.
- **`FocusTodayItem`** — vendor only. `#1`/`#2`/`#3` reason copy on top, `TaskCardView` below.
- **`SparkleIcon`** — fixed 16×16 Vector mark. Always paired with the company name in the `InsightCardHeader`.
- **`EmptyMessage`** — 12px `textMuted` paragraph for empty section states ("No active risks.", "Quiet week ahead.").

When extending: add a new `oi-section--<name>` class in `globals.css` to place a section in the existing grid; do **not** introduce a different card shell. Customer-facing sections (`PortalOverview`) reuse the same primitives with a 2-column layout (Summary | Wins, full-width Focus this week below).

## Do's and don'ts

### Do

- **Layer surfaces** for depth, not shadows. Add `1px solid border` if more separation is needed.
- **Use `textSecondary` as the hover step** from `textMuted` on navigation surfaces.
- **Use `MenuList` + `MenuOption`** for every dropdown — even one-off menus and plain pick-one-value fields. There is no native `<select>` in the DS.
- **Reach for `rounded-full` only for avatar circles.** Everything else uses `rounded` or larger.
- **Use the avatar palette** (`mint / rose / sunset / lilac / sky / candy`) for company / contact initials only.
- **Add an icon button's `isActive` state** when the menu it controls is open — the persistent active style tells the user "this opened the thing".
- **Use registry icons, and reach for a `Button` variant instead of a colour override.** A destructive action is `variant="destructive"` (solid, for the confirming step) or `variant="tertiary" tone="danger"` (inline row action) — never a secondary button with `style={{ color: "var(--danger)" }}`.
- **Give a field pill or row with a removable value `onClear`.** The Clear (X) appears inline at the end of the row on hover, focus-within and while the field is open, and the field grows to fit it; it is part of `FieldPill` and `FieldRow` (a sibling button after the native main control), never hand-rolled at the call site. Date pickers open on the current month (or the selected date's month).

### Don't

- **Don't apply icon-button hover treatment (bg pill + full `text`) to tabs or other navigation surfaces.** Caroline's rule: tabs use a colour-only shift to `textSecondary`, no background. The underline already signals selection.
- **Don't use status colours for decoration** (e.g. `danger` for "important" without an actual destructive action).
- **Don't pre-extract components into `app/ui/`** before they've earned it. Wait for the user to flag a pattern as worth formalising.
- **Don't ship `rounded-full` on a square element.** It's reserved for circles.
- **Don't add new top-level CSS custom properties without updating this file** — DESIGN.md is the source of truth. `globals.css` should match.
- **Don't put a primary button on a repeated row.** One filled button per page section, max. A column of identical primaries conveys no hierarchy and drowns the page's real primary action. Rows get `secondary` (accept) + `tertiary` (everything else).
- **Don't invent a fourth button tier.** The ladder is primary > secondary > tertiary. If a button feels "between" tiers, it's tertiary. There is no ghost/subtle/quiet variant — that's what tertiary is.
- **Don't give a tertiary button a background on hover.** It brightens its label and nothing else, so it sits beside an inline `Dismiss` without the two looking like different components.

## Architecture

- **`app/ui/`** — design system primitives. No business logic, pure presentation.
- **`app/components/`** — feature components. Compose UI primitives with business logic.
- **Tokens** — generated into `app/theme.css` (`@theme` + legacy `:root` aliases) from this file. Prefer the utility classes (`bg-action`, `text-muted`) in new code; `var(--token-name)` works everywhere for CSS and dynamic styles.
- **Variant API** — props like `variant`, `size` (will adopt `class-variance-authority` when this DS formalises).
- **Composition over configuration** — compound components (Container + Item) rather than mega-config props.

## Future plans (not yet implemented)

The full roadmap is `docs/DS-PLAN.md`; still-open items that belong to this file:

- Move Menu primitives from `app/components/Menu.js` to `app/ui/` (DS-PLAN Phase 5)
- Extract Badge, Spinner-as-component, Modal, Field/Input primitives (DS-PLAN Phase 5)

Done since this list was written: tokens now emit as a Tailwind `@theme` block;
`cn()` exists (`app/ui/cn.ts`); the typography scale is formalised above
(xs–lg = Tailwind defaults, already in use at runtime).
