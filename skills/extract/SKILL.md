---
name: extract
description: Extract logic from oversized components or files into smaller, focused pieces. Use when a component exceeds ~300 lines, when globals.css has redundant classes, or when the user asks to refactor/split/extract a component.
disable-model-invocation: true
argument-hint: "[file or component to extract from]"
---

# Extract & Decompose

This project has two files that grow with every feature. Use this skill to break them down safely.

## Known large files

| File | Lines | Why it grows |
|------|-------|-------------|
| `app/onboardings/[id]/OnboardingDetailClient.js` | ~800+ | Every kanban/phase/task feature lands here |
| `app/globals.css` | ~330+ | Every hover/animation/tooltip class gets added here |
| `lib/db.js` | ~850+ | Every new model adds 3-5 query functions |
| `app/components/CreateTaskModal.js` | ~680+ | Complex form with many field types |

## Extraction process

### Step 1: Identify extraction candidates

Read the target file. Look for:
- **Self-contained blocks** — functions or JSX that don't share much state with the rest
- **Repeated patterns** — similar code appearing 3+ times
- **Feature boundaries** — health scoring, drag-and-drop, phase management, task actions
- **CSS classes used by only one component** — these should live with the component, not in globals

### Step 2: Verify dependencies

Before extracting, map what the block depends on:
- Props/state it reads
- Callbacks it calls
- Hooks it uses

If it reads >5 pieces of parent state, consider whether a custom hook would be cleaner than a component.

### Step 3: Extract

**For components** → new file in `app/components/`:
```javascript
// Extract from OnboardingDetailClient.js
// Before: inline JSX block for phase headers
// After: app/components/PhaseHeader.js

export default function PhaseHeader({ phase, onRename, onDelete }) {
  // extracted logic here
}
```

**For hooks** → new file alongside the component or in a `hooks/` directory:
```javascript
// Extract from OnboardingDetailClient.js
// Before: inline drag-and-drop state + handlers
// After: useDragAndDrop.js

export function useDragAndDrop(phases, onReorder) {
  // extracted state + handlers
}
```

**For db.js** → group by model if it exceeds ~1000 lines:
```
lib/
  db.js              → keep as single entry point with re-exports
  db/
    companies.js     → Company queries
    onboardings.js   → Onboarding queries
    tasks.js         → Task queries
    ...
```

**For globals.css** → move component-specific classes to CSS modules or inline:
- Classes used globally (scrollbars, icon-btn, menu-option) stay in globals.css
- Classes used by one component should use Tailwind utilities inline instead
- Check if a class duplicates what Tailwind already provides

### Step 4: Verify

After extracting:
1. Check imports are correct
2. Verify the extracted piece works in isolation
3. Confirm the parent file is simpler and shorter
4. Run `npm run build` to catch any breakage

## Rules

- **Don't extract prematurely** — only extract when a file is genuinely hard to navigate (~300+ lines for components, ~100+ lines for a single concern in CSS)
- **Don't create abstractions for one-time code** — if it's used once, leave it inline
- **Keep the same public API** — parent components shouldn't need changes to their own parents
- **One extraction per pass** — extract one thing, verify it works, then consider the next
