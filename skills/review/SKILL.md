---
name: review
description: Review recently changed code for quality issues — dead code, unused imports, DS token consistency, missing validation, and accessibility. Use when the user asks to review code, or after completing a feature.
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob, Bash
---

# Code Review

Review the recent changes in this project. Focus on these categories:

## 1. Dead code & unused imports

- Search for imports that aren't used in the file
- Look for functions/variables that are defined but never called
- Check for commented-out code blocks that should be removed

## 2. Design system consistency

- Verify color values use CSS custom properties from `app/globals.css` (e.g., `var(--text)`, `var(--bg-hover)`), not hardcoded hex values
- Check that all dropdowns/popovers use `MenuList` + `MenuOption` from `app/components/Menu.js`
- Verify `IconButton` usage: `w-5 h-5 rounded` (never `rounded-full`), `.icon-btn` class
- Check `Button` uses `variant="primary"` or `variant="secondary"`, not custom styling

## 3. Data layer patterns

- All DB access must go through `lib/db.js` — no direct Prisma calls from routes or components
- All ID parameters must be validated with `Number(id)` / `Number.isNaN()` before Prisma calls
- API routes must call `supabase.auth.getUser()` as auth guard

## 4. Next.js patterns

- Dynamic route params must be awaited: `const { id } = await params`
- Server vs client component boundaries are correct
- No `use client` on components that don't need it

## 5. Accessibility

- Interactive elements have `aria-label` or visible text
- `IconButton` components have `aria-label` prop
- Form inputs have associated labels

## Output

Report findings grouped by category. For each issue, include:
- File path and line number
- What's wrong
- Suggested fix (one line)

If everything looks clean, say so briefly.
