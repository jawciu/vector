# Design System Skill

## Overview
This project has a growing design system. Components live in `app/ui/` (design system primitives) separate from `app/components/` (feature-specific components). The user is incrementally adding elements — **only add components to the DS when explicitly asked**.

## Current State

### Tokens (CSS Custom Properties)
Defined in `app/globals.css` under `:root`. Not yet migrated to `@theme`.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#18181E` | Page background |
| `--bg-elevated` | `#1D1C24` | Elevated surfaces (modals, cards) |
| `--bg-hover` | `#211F29` | Hover state on menu items, rows |
| `--surface` | `#1f1e26` | Interactive surface (buttons, inputs) |
| `--surface-hover` | `#26242F` | Active/selected state on surfaces |
| `--border` | `#25232D` | Default borders |
| `--text` | `#F1EAF1` | Primary text |
| `--text-muted` | `#999599` | Secondary/dimmed text |
| `--action` | `#C098FF` | Primary action color (purple) — default |
| `--action-hover` | `#CAA8FF` | Primary button hover state |
| `--action-active` | `#9E6CEE` | Primary button active/pressed state |
| `--action-disabled` | `#604C80` | Primary button disabled state |
| `--danger` | `#FF899B` | Destructive actions |
| `--success` | `#9CFFA6` | Success states |
| `--alert` | `#FFEEB5` | Warning/caution |
| `--mint` | `#9DFFF4` | Badge/avatar accent |
| `--rose` | `#D8A7FF` | Badge/avatar accent |
| `--sunset` | `#FFB9A1` | Badge/avatar accent |
| `--lilac` | `#B3A5FF` | Badge/avatar accent |
| `--sky` | `#85C0FF` | Badge/avatar accent |
| `--candy` | `#FF9EE5` | Badge/avatar accent |
| `--accent` | `#22d3ee` | Accent cyan |
| `--accent-muted` | `#0891b2` | Dimmed accent |
| `--warning` | `#fbbf24` | Warning amber |
| `--text-dark` | `#18181E` | Text on bright backgrounds |

### DS Components (in `app/ui/`)

#### `IconButton` (`app/ui/IconButton.js`)
Small square icon buttons used throughout the UI (meatball menus, plus icons, close buttons, etc.).

**Props:**
- `onClick` — click handler
- `aria-label` — required for accessibility
- `isActive` — boolean, adds `.icon-btn--active` when true (e.g. while a menu is open)
- `disabled` — boolean, passed to the underlying button

**Rules:**
- Always `rounded` (not `rounded-full`) — rounded square shape, never a circle
- Size is fixed at `w-5 h-5` (20×20px)
- Icons inside should be 11–12px SVGs using `currentColor`
- `rounded-full` is reserved for avatar/initials circles only

**CSS (defined in `globals.css`):**
```css
.icon-btn               /* default: --text-muted color */
.icon-btn:hover         /* bg: --bg-hover, color: --text */
.icon-btn:active        /* bg: --surface-hover, color: --text */
.icon-btn--active       /* bg: --surface-hover, color: --text (persists while open) */
```

**Usage:**
```jsx
import IconButton from "@/app/ui/IconButton";

<IconButton onClick={() => setOpen(o => !o)} isActive={open} aria-label="Options">
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
  </svg>
</IconButton>
```

#### `Button` (`app/ui/Button.js`)
- **Variants:** `primary`, `secondary`
- **Sizes:** `xs` (`py-0.5 px-2 text-xs`), `sm` default (`py-1 px-2 text-sm`)
- **Primary:** solid purple, `font-semibold`, CSS class `.btn-primary` — default `--action`, hover `--action-hover`, active `--action-active`, disabled `--action-disabled`
- **Secondary:** bordered surface button, `font-normal`, CSS class `.btn-secondary` — `var(--surface)` bg, `var(--border)` border, `var(--text)` color; hover `--bg-hover`, active `--surface-hover`, disabled text becomes `--text-muted` (border unchanged)
- **Usage:** `<Button variant="primary" size="sm">Create</Button>` / `<Button variant="secondary" size="sm">Cancel</Button>`
- Cancel/dismiss buttons alongside a primary Button always use `variant="secondary"` with matching size

### Shared Components (in `app/components/Menu.js`)
Currently the reusable menu primitives live here. These should be migrated to `app/ui/` when the DS is formalized.

- **MenuTriggerButton** — Styled button for opening menus
- **MenuList** — Absolutely-positioned dropdown container with `padding: 4px`, `flex flex-col gap-1`, `rounded-lg`, `border`, uses `--bg` background and `--border` border
- **MenuOption** — Menu item with `rounded`, `padding: 4px 8px`, hover via `.menu-option` CSS class (`background-color: var(--bg-hover)`), active state via `.menu-option-active` (`background-color: var(--surface-hover)`)

### Hover/Interactive CSS Classes (in `globals.css`)
- `.menu-option:hover` → `background-color: var(--bg-hover)`
- `.menu-option-active` → `background-color: var(--surface-hover)`
- `.company-cell-link:hover` → `background-color: var(--bg-hover)`
- `.task-filter-btn:hover` → `background-color: var(--surface-hover)`

## Creating a New DS Component

1. Check existing DS components in `app/ui/`
2. Follow existing patterns (variants, size props, color tokens)
3. Export from the DS index file
4. Migrate any existing inline usages to the new component

## Rules & Patterns

### Dropdown/Popover Pattern
Every dropdown or popover menu MUST use `MenuList` + `MenuOption` from `app/components/Menu.js` (or `app/ui/` once migrated). This ensures:
- Consistent `4px` inner padding on the container
- `4px` gap between items
- `rounded` corners on each item with `4px 8px` padding
- Hover highlight: `var(--bg-hover)`
- Active/selected highlight: `var(--surface-hover)`
- Container background: `var(--bg)` with `var(--border)` border

When creating action menus (like "more" dots), override `MenuOption` styles for color per item (e.g. `color: var(--danger)` for delete) but keep the structural styles from the shared component.

### Color Usage
- Normal menu items: `color: var(--text)` or `var(--text-muted)` (inactive)
- Destructive actions: `color: var(--danger)`
- Warning actions: `color: var(--alert)`
- Active/selected: `fontWeight: 600`, `color: var(--text)`
- Inactive: `fontWeight: 400`, `color: var(--text-muted)`

### Typography (not yet formalized)
Currently using inline Tailwind classes. Will be formalized when user requests it.

### Badges (not yet formalized)
Status badges exist in feature components. Will be extracted when user requests it.

## Architecture Principles

1. **`app/ui/`** = design system primitives (no business logic, pure presentation)
2. **`app/components/`** = feature components (compose UI primitives with business logic)
3. **Variant API** — Use props like `variant`, `size` for visual variations (plan to adopt CVA when formalizing)
4. **CSS Custom Properties** for theming — all colors via `var(--token-name)`
5. **Composition over configuration** — Compound components (Container + Item) rather than mega-config props
6. **Incremental adoption** — Don't extract everything at once. User will say when a component should join the DS.

## Future Plans
- Migrate tokens to Tailwind v4 `@theme` directive
- Move Menu.js primitives to `app/ui/dropdown/`
- Add CVA for variant management (`class-variance-authority`)
- Create `cn()` utility for class merging (`clsx` + `tailwind-merge`)
- Formalize Badge, Typography, Button components as user requests
