---
name: style-right
description: Get interactive states, tokens, and visual polish right on the first pass — hover, active, focus, disabled, open/closed. Use when building a new UI component or element that has interactive states, or when the user asks to style something.
---

# Style Right First Time

This project has a history of styling revision loops — building a component, then coming back in follow-up commits to fix hover states, active tokens, and visual inconsistency. This skill ensures all interactive states are handled on the first pass.

## Before writing any styles

1. Read `app/globals.css` — check for existing CSS classes that already handle the pattern
2. Read `app/ui/` components — check if a DS primitive already exists (Button, IconButton, FieldPill)
3. Read `app/components/Menu.js` — all dropdowns/popovers MUST use MenuList + MenuOption

## Interactive state checklist

Every interactive element needs ALL of these considered (skip only if truly N/A):

### Buttons & clickable elements
| State | Token/Pattern |
|-------|---------------|
| Default | `color: var(--text-muted)` or `var(--text)` |
| Hover | `background: var(--bg-hover)` |
| Active/pressed | `background: var(--surface-hover)` |
| Disabled | `opacity: 0.5` or `color: var(--text-muted)`, `cursor: not-allowed` |
| Focus-visible | `outline: 2px solid var(--action)`, `outline-offset: 2px` |

### Toggles & open/close triggers (dropdowns, drawers, modals)
| State | Pattern |
|-------|---------|
| Closed | Default styling |
| Open | Add `.icon-btn--active` (for IconButton) or `var(--surface-hover)` bg |
| Transition | Close should feel instant, open can have subtle animation |

### Form inputs
| State | Pattern |
|-------|---------|
| Default | `border: 1px solid var(--border)`, `bg: var(--surface)` |
| Focus | `border-color: var(--action)` |
| Error | `border-color: var(--danger)` |
| Disabled | `opacity: 0.5`, `cursor: not-allowed` |

### Cards & list items
| State | Pattern |
|-------|---------|
| Default | `bg: transparent` or `var(--surface)` |
| Hover | `bg: var(--bg-hover)` |
| Selected/active | `bg: var(--surface-hover)`, `font-weight: 600` |

## Token reference (quick access)

```
--bg            #18181E    Page background
--bg-hover      #211F29    Hover on menus, rows, cards
--surface       #1f1e26    Input/button surfaces
--surface-hover #26242F    Active/selected surfaces
--border        #25232D    Borders
--text          #F1EAF1    Primary text
--text-muted    #999599    Secondary text
--action        #C098FF    Purple primary action
--action-hover  #CAA8FF    Primary hover
--action-active #9E6CEE    Primary pressed
--danger        #FF899B    Delete/destructive
--success       #9CFFA6    Success
--alert         #FFEEB5    Warning
```

## Common mistakes to avoid

1. **Using `rounded-full` on icon buttons** — always `rounded` (rounded square). `rounded-full` is ONLY for avatar circles.
2. **Hardcoding hex colors** — always use `var(--token)`. Check the token table above.
3. **Missing hover on clickable elements** — if it's clickable, it needs a hover state.
4. **Forgetting the "open" state** on dropdown triggers — when a menu/popover is open, the trigger should show `--surface-hover` bg.
5. **Adding `* { padding: 0 }` or `* { margin: 0 }` in globals.css** — Preflight handles this. Adding it breaks all Tailwind spacing utilities.
6. **Creating new CSS classes in globals.css without checking existing ones** — search first, reuse if possible.

## Decision: Tailwind class vs CSS class in globals.css

- **One-off styling**: Tailwind utility classes inline
- **Reused across 3+ elements with the same hover/active pattern**: CSS class in globals.css
- **DS primitive**: Component in `app/ui/` (only when user explicitly asks)

## Before submitting

Mentally walk through each state:
1. What does it look like at rest?
2. What happens on mouse hover?
3. What happens on click/press?
4. What happens when it's active/open/selected?
5. What happens when it's disabled?
6. Does it use the correct DS tokens, not hardcoded colors?
