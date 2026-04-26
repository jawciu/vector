---
name: Vector
version: 0.1.0
description: Design system for Vector — a B2B onboarding workflow tool.
colors:
  # Spec-convention semantic aliases (point to our named tokens via references).
  primary: "{colors.action}"        # Brand primary = the action ramp's default
  secondary: "{colors.text}"        # Body / heading text
  tertiary: "{colors.accent}"       # Cyan accent (used sparingly)

  # Surfaces — vertical stacking by elevation
  bg: "#18181E"                 # Page / app background (lowest)
  bgElevated: "#1D1C24"         # Elevated surfaces — cards, modals, kanban task cards
  bgElevatedHover: "#232028"    # Hover on bg-elevated surfaces
  bgHover: "#211F29"            # Hover on transparent / bg surfaces — menu rows, links
  navHover: "#211F29"           # Hover on nav surfaces (alias of bgHover)
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
  alert: "#FFDA91"              # Warning, caution
  warning: "#FBBF24"            # Warning amber (notifications, badges)

  # Accent / utility
  accent: "#22D3EE"             # Cyan accent (rare use)
  accentMuted: "#0891B2"        # Muted cyan
  iconTertiary: "#5D565D"       # Disabled / placeholder icon

  # Avatar / badge palette (rotates by initials hash)
  mint: "#9DFFF4"
  rose: "#D8A7FF"
  sunset: "#FFA673"
  lilac: "#B3A5FF"
  sky: "#85C0FF"
  candy: "#FF9EE5"

  # Component-level
  buttonSecondaryBorder: "#2E2C38"

typography:
  fontFamily:
    sans: "var(--font-geist-sans), system-ui, sans-serif"
  # Sizes are currently expressed via Tailwind utility classes (text-xs, text-sm, …).
  # When we formalise a scale these will move into named ramps.
  body:
    fontSize: 14px
    lineHeight: 1.5
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
  xs: 4px      # Pills, small badges, IconButton
  sm: 6px      # Status badges, menu options
  md: 8px      # Inputs, secondary buttons
  lg: 10px     # Cards, hero panels
  xl: 12px     # Large modal-like surfaces (bulk action bar)
  full: 9999px # Avatar circles ONLY

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

A dark-first design system for a B2B onboarding workflow tool. Tone: clear, operator-focused, minimal chrome, action-led. Built on **Tailwind CSS v4** with a CSS-first `@theme` config; `globals.css` is the runtime source, this file is the documented source of truth.

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
| IconButton | `rounded.xs` (`4px`) | **Always `rounded`, never `rounded-full`** |
| Pills, status badges | `rounded.xs` / `rounded.sm` | |
| Inputs, secondary buttons | `rounded.md` | |
| Cards, hero panels | `rounded.lg` | InsightsPanel cards, PortfolioInsightsHero |
| Bulk action bar, modals | `rounded.xl` | Floating surfaces |

## Components

### `Button` — `app/ui/Button.js`

Variants: `primary` | `secondary`. Sizes: `xs` | `sm` (default).
- **Primary**: `font-semibold`, uses `.btn-primary` CSS class. Default `action`, hover `actionHover`, active `actionActive`, disabled `actionDisabled`. Text always `actionText`.
- **Secondary**: `font-normal`, uses `.btn-secondary` CSS class. `surface` background, `border` border, `text` colour. Hover `bgHover`, active `surfaceHover`. Disabled keeps the border but text becomes `textMuted`.

Cancel/dismiss buttons alongside a primary always use `variant="secondary"` at the same size.

### `IconButton` — `app/ui/IconButton.js`

Small square icon-only buttons (meatball menus, plus icons, close buttons). Fixed at `w-5 h-5` (20×20px). `rounded` (NOT `rounded-full`). Uses `.icon-btn` CSS class. Add `isActive` while the menu it controls is open — applies `.icon-btn--active` (`surfaceHover` background + full `text` colour).

Inner SVGs should be 11–12px and use `currentColor`.

### Menu primitives — `app/components/Menu.js`

To be migrated to `app/ui/dropdown/` when DS formalises.

- **`MenuTriggerButton`** — styled trigger for opening menus
- **`MenuList`** — absolutely-positioned dropdown container. `padding: 4px`, `flex flex-col gap-1`, `rounded-lg`, `border`, `bg` background, `border` border.
- **`MenuOption`** — menu row. `rounded`, padding `4px 8px`. Hover via `.menu-option` (`bgHover`), active via `.menu-option-active` (`surfaceHover`).

**Every dropdown / popover MUST use `MenuList` + `MenuOption`.** This guarantees the consistent 4px container padding, 4px row gap, hover/active states, and border.

### TabBar — `app/ui/TabBar.js`

Underline-as-selection pattern. Inactive tabs are `textMuted`, hover bumps to `textSecondary` (NOT to `text`), active tabs are `text` with a 2px underline indicator. **No background pill** on hover — the underline is the only "selected" cue, doubling up reads as redundantly selected.

## Do's and don'ts

### Do

- **Layer surfaces** for depth, not shadows. Add `1px solid border` if more separation is needed.
- **Use `textSecondary` as the hover step** from `textMuted` on navigation surfaces.
- **Use `MenuList` + `MenuOption`** for every dropdown — even one-off menus.
- **Reach for `rounded-full` only for avatar circles.** Everything else uses `rounded` or larger.
- **Use the avatar palette** (`mint / rose / sunset / lilac / sky / candy`) for company / contact initials only.
- **Add an icon button's `isActive` state** when the menu it controls is open — the persistent active style tells the user "this opened the thing".

### Don't

- **Don't apply icon-button hover treatment (bg pill + full `text`) to tabs or other navigation surfaces.** Caroline's rule: tabs use a colour-only shift to `textSecondary`, no background. The underline already signals selection.
- **Don't use status colours for decoration** (e.g. `danger` for "important" without an actual destructive action).
- **Don't pre-extract components into `app/ui/`** before they've earned it. Wait for the user to flag a pattern as worth formalising.
- **Don't ship `rounded-full` on a square element.** It's reserved for circles.
- **Don't add new top-level CSS custom properties without updating this file** — DESIGN.md is the source of truth. `globals.css` should match.

## Architecture

- **`app/ui/`** — design system primitives. No business logic, pure presentation.
- **`app/components/`** — feature components. Compose UI primitives with business logic.
- **CSS Custom Properties** — all colours via `var(--token-name)`. Tokens live in `globals.css` `:root`.
- **Variant API** — props like `variant`, `size` (will adopt `class-variance-authority` when this DS formalises).
- **Composition over configuration** — compound components (Container + Item) rather than mega-config props.

## Future plans (not yet implemented)

- Migrate tokens from `:root` to Tailwind v4 `@theme` block in `globals.css`
- Formalise the typography scale
- Move Menu primitives from `app/components/Menu.js` to `app/ui/dropdown/`
- Add `cn()` utility (`clsx` + `tailwind-merge`)
- Extract Badge, Status pill, Avatar as DS primitives when they earn it
- Generate `globals.css` token block from this file via `design.md export` once the tooling is wired (Option A — see implementation plan)
