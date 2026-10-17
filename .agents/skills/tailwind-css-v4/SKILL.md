---
name: tailwind-css-v4
description: Tailwind CSS v4 expertise for styling Next.js apps. Use when writing or debugging Tailwind utility classes, fixing CSS issues, or configuring Tailwind v4.
metadata:
  author: onboarding-project
  version: "1.0"
---

# Tailwind CSS v4

## Key Differences from v3

- **Single import**: Use `@import "tailwindcss"` instead of `@tailwind base/components/utilities`
- **No config file**: No `tailwind.config.js`. Use CSS-first configuration with `@theme` directive
- **PostCSS plugin**: Use `@tailwindcss/postcss` (not `tailwindcss` directly) in postcss.config
- **Logical properties**: `px-*` generates `padding-inline`, `py-*` generates `padding-block` (not `padding-left`/`padding-right`)
- **Content auto-detection**: v4 automatically scans all project files for class names

## Critical: CSS Cascade Order

The `@import "tailwindcss"` position in your CSS file determines cascade order. **Any custom CSS written AFTER the import will override Tailwind utilities.**

### Common Bug: Global Reset Overriding Utilities

This is WRONG and will break all padding/margin utilities:

```css
@import "tailwindcss";

/* BAD: This overrides ALL Tailwind padding/margin utilities */
* {
  padding: 0;
  margin: 0;
}
```

Tailwind's preflight already resets padding and margin. Adding your own `* { padding: 0; margin: 0; }` after the import creates a rule that wins in the cascade, making `px-6`, `py-2.5`, `p-4`, etc. all silently fail.

### How to Diagnose

If some Tailwind classes work (e.g. `rounded-lg`, `text-sm`, `font-medium`) but padding/margin classes don't, check `globals.css` for a universal `*` reset after `@import "tailwindcss"`.

### Correct Approach

Either remove the custom reset entirely (preflight handles it):

```css
@import "tailwindcss";

* {
  box-sizing: border-box;
  /* No padding: 0 or margin: 0 needed - preflight handles this */
}
```

Or use `@layer base` so Tailwind utilities can override it:

```css
@import "tailwindcss";

@layer base {
  * {
    box-sizing: border-box;
    padding: 0;
    margin: 0;
  }
}
```

## Preflight (Built-in Reset)

Tailwind v4's preflight already applies these resets:

```css
*, ::after, ::before, ::backdrop, ::file-selector-button {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 0 solid;
}
```

Plus: headings unstyled, lists unstyled, images block-level, etc. Do NOT duplicate these in your own CSS.

## Padding Utilities Reference

| Class | CSS Output |
|-------|-----------|
| `p-0` | `padding: 0` |
| `p-1` | `padding: calc(var(--spacing) * 1)` = 4px |
| `p-2` | 8px |
| `p-3` | 12px |
| `p-4` | 16px |
| `p-5` | 20px |
| `p-6` | 24px |
| `p-8` | 32px |
| `p-px` | `padding: 1px` |
| `p-[5px]` | `padding: 5px` (arbitrary) |
| `p-(--my-var)` | `padding: var(--my-var)` (CSS variable) |

Same pattern for `px-*` (horizontal), `py-*` (vertical), `pt-*`, `pr-*`, `pb-*`, `pl-*`, `ps-*` (inline-start), `pe-*` (inline-end).

Decimal values work: `p-2.5` = 10px, `p-1.5` = 6px.

## Spacing & Sizing Scale

Default `--spacing` is `0.25rem` (4px). So class number * 4px = pixel value:
- `1` = 4px, `2` = 8px, `3` = 12px, `4` = 16px, `6` = 24px, `8` = 32px

## Handling Specificity Issues

If a utility class isn't applying:

1. **Check globals.css** for rules after `@import "tailwindcss"` that target the same property
2. **Use `!` modifier** to force: `px-6!` adds `!important`
3. **Use `@layer base`** for custom base styles so utilities always win
4. **Use arbitrary values** with `[]`: `p-[10px_24px]`
5. **Inline styles always win** over classes: use `style={{ padding: "10px 24px" }}` as a last resort

## Configuration with @theme

Customize the design system in CSS (no config file needed):

```css
@import "tailwindcss";

@theme {
  --spacing: 1px;           /* Base spacing unit */
  --color-primary: #C098FF; /* Custom color */
  --font-sans: "Inter", sans-serif;
}
```

## Common Patterns for Buttons

```jsx
{/* Primary button */}
<button className="py-2.5 px-6 rounded-lg text-sm font-medium">
  Create
</button>

{/* With dynamic colors via style prop (correct pattern) */}
<button
  className="py-2.5 px-6 rounded-lg text-sm font-medium"
  style={{ background: "var(--action)", color: "#0a0a0a" }}
>
  Create
</button>
```

Use Tailwind classes for spacing, layout, typography. Use inline `style` for dynamic CSS variable colors.

## Debugging Checklist

When Tailwind classes aren't working:

1. Is `@import "tailwindcss"` present in globals.css?
2. Is `@tailwindcss/postcss` in postcss.config?
3. Are there ANY custom CSS rules after the import that target the same properties?
4. Is the `.next` cache stale? Try deleting `.next/` and restarting dev server
5. Check browser DevTools > Elements > Computed styles to see what's actually applied
6. Check for `* { }` selectors that reset properties Tailwind is trying to set
