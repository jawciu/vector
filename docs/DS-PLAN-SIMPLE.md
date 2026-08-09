# Vector design system plan, in plain English

> This is the same plan as `DS-PLAN.md`, section for section, explained simply.
> Read them side by side: every heading here matches a heading there.

## Context

We are rebuilding Vector's design system so that AI agents (like Claude) can follow it reliably, not just humans. Two reasons: it teaches you how to build agent-friendly design systems (a rare, valuable skill for founding designer roles), and the finished thing becomes a public portfolio piece with real before/after numbers.

Two deliverables:
- **Part A**: a checklist method for auditing ANY design system, which you can reuse at future jobs, plus a script that runs the audit automatically.
- **Part B**: the actual build, split into 10 phases that each finish cleanly on their own.

**Decisions you already made:** TypeScript only in the `app/ui/` folder (the rest of the app stays JavaScript). Visual testing we host ourselves (Playwright screenshots + a free Storybook site on Vercel, no paid Chromatic service). And we rebuild the existing app in two stages: the worst offenders first (stage one), then a full sweep that cleans up everything else (stage two, your addition).

**What the audit found, in short:** your token layer (the named colours in DESIGN.md) is genuinely good, and your agent instructions (CLAUDE.md, skills) are better than most companies have. The problems: the tokens are not plugged into Tailwind so you cannot write `bg-action` as a class; only colours made it into CSS (spacing, radius, type sizes exist on paper only); most of the app styles itself with one-off inline styles instead of shared components (1,081 of them); only 17% of buttons use your Button component; four modals are copy-pastes of each other with no screen-reader support; all 27 form inputs are hand-made; there is no Storybook, no tests for components, and nothing that automatically catches someone (human or agent) breaking the rules. Also the docs claim a few things that are not true anymore, which is dangerous because agents believe docs.

**The philosophy:** put knowledge as deep in the system as possible. Best: a rule an agent physically cannot break (a token, a component default). Next best: a rule that makes a red error appear (lint, a failing test), because agents see errors and fix themselves. Worst: a rule written in a document, because it relies on someone reading it. Storybook sits in the middle as the "contract": every state a component officially supports gets a story, and if the state you need has no story, you are off the map.

---

# Part A — How to audit a design system (the reusable method)

## A.1 Seven lenses, checked bottom-up

Check the foundations first, because if the tokens are broken, nothing above them matters. Each lens says: what to measure, how to measure it mechanically (with searches, not vibes), and what "good" looks like. A full pass on a codebase you have never seen takes about half a day.

1. **Token layer.** Is there ONE official file of named colours/sizes, in a format a machine can read? How many raw colour codes (like `#3B82F6`) leak into the app outside that file? Can the styling system actually USE the tokens (do classes like `bg-action` exist)? Are there tokens for more than colour: text sizes, spacing, corner radius, shadows, animation speed? Is the CSS generated from the source file automatically, or copied by hand (hand-copying always drifts out of date)?
   *Vector:* source file and pipeline are real, only 4 stray colour codes (excellent). But tokens are not plugged into Tailwind, only colours get generated, and there is no text-size scale.

2. **Component coverage.** Not "does a Button component exist" but "what PERCENTAGE of buttons on screen actually use it". We always show the raw count next to the percentage (18 of 103 buttons, 17%), because both tell you something: the ratio says how healthy the system is, the count says how big the clean-up job is. Same for inputs and icons. Also: which components are missing entirely, and where has code been copy-pasted instead of shared?
   *Vector:* Button 17%, inputs 0%, icons 6%, four duplicated modals, and about eight components that should exist but do not (Modal, Input, Badge, Spinner...).

3. **State completeness.** For each component: does it handle hover, keyboard focus, disabled, loading, error, empty, all by itself? Or does every screen re-invent those states? Does it respect the user's "reduce motion" setting?
   *Vector:* the shared CSS classes handle states well. But the hand-made buttons and all the inputs handle nothing, and nothing in the app has a loading state.

4. **Accessibility floor.** Search for the accessibility attributes (`role="dialog"`, `aria-label`...) and count them. Then manually check the riskiest patterns: can you close a modal with Escape? Does keyboard focus get trapped inside it? Do form fields have proper labels? Is colour contrast checked by a tool or by hope?
   *Vector:* modals have zero screen-reader support and no focus trapping. Contrast IS checked by a tool (a genuine strength).

5. **Enforcement and feedback loops.** The lens most audits skip, and the most important one for agents. Does anything FAIL (red error) when someone uses a raw colour code? Do the checks run automatically on every change (CI)? Could an agent discover it broke the design without a human looking at the screen?
   *Vector:* the token file checks itself, but nothing checks the app code. The only automatic check is unit tests.

6. **Docs and drift.** Compare every claim the docs make against the actual code. Docs that lie are worse than no docs, because agents load them into their heads and confidently follow them.
   *Vector:* DESIGN.md claims a Tailwind setup that does not exist, one component's documented corner radius contradicts the scale, a skill file has two outdated colour values, and one CSS class is dead code.

7. **Agent affordances.** Is knowledge pushed down the stack (tokens, defaults, errors) or is everything prose? Are the rules wired to triggers ("read this file before doing X")? Is there something an agent can query (types, stories) rather than just read? Are component options locked down (a fixed list the type-checker enforces) or just loose text?
   *Vector:* the instructions layer is exceptional. But the rules are all prose: nothing is enforced by types, lint, or tests. The system is documented for agents but not ENFORCED for agents.

## A.2 Make the audit a script: `scripts/audit-ds.mjs`

Instead of doing the searches by hand every time, we write a small script that runs them all and prints a scorecard: how many raw colours, how many inline styles, how many buttons use Button out of how many total (count and percentage side by side), and so on. It can also compare against a saved snapshot and FAIL if any number got worse, which turns it into a guard rail: the codebase can only ever improve. The search patterns sit in one list at the top, so you can drop this script into any React codebase at a future job and tune it in ten minutes. The script plus the seven lenses above IS the thing you take with you.

---

# Part B — The build, in phases

Order logic: measure first (you can never recapture the "before" numbers once you start fixing), then foundations (types and tokens, because everything else is built on them), then the automatic rules (so everything built afterwards is born correct), then Storybook (so new components arrive WITH their stories), then the new components, then screenshot testing and the public site, then fixing the old screens in two stages (worst offenders, then everything else), then updating the agent instructions, then the portfolio piece. Every phase can be finished and shipped on its own.

## Phase 0 — Baseline audit (half a day)
Write the audit script, run it, save the numbers, fix nothing. These numbers are the "before" photo for the portfolio.
**Done when:** the script's numbers match what we found by hand (1,081 inline styles, ~103 raw buttons, 27 inputs).

## Phase 1 — TypeScript foundation (half a day)
Set up TypeScript so it applies to `app/ui/` without touching the rest of the app. Add a tiny helper called `cn()` for combining CSS classes safely. Then convert ONE component, Button, as the template for all the rest: its options become a locked list (`'primary' | 'secondary' | ...`) so an invalid variant is a red squiggle, not a silent mistake, and it gains a proper `loading` state (spinner, keeps its width so the layout does not jump, tells screen readers it is busy). That loading state is the showcase of "all states baked in".
**Done when:** the type-checker, the build, and the tests all pass, and every existing Button on screen looks identical.

## Phase 2 — Token pipeline v2 (1 day, the highest-value phase)
Rewrite the script that turns DESIGN.md into CSS so it produces two things:
1. A Tailwind `@theme` block, which makes classes like `bg-action`, `text-muted` and `shadow-floating` actually exist. This is the moment the tokens become the easiest way to style anything.
2. A compatibility block that keeps every OLD variable name working, so all 1,200 lines of existing CSS and 1,081 inline styles keep rendering exactly as before. Nothing breaks; we migrate at our leisure.
Also: finally add the text-size scale (12/14/16/18/22) to DESIGN.md so it becomes real, add a token for the modal's dark overlay, and fix the places where the docs lie. The full lens audit (docs/ds-audit/2026-08-lenses.md) found 52 documentation defects plus one real bug that gets fixed here: a global CSS reset sits in the wrong place and silently disables every Tailwind margin class in the app. Fixing it needs care, because margin classes that never worked will suddenly start working, so we check where they're used first. One caught gotcha: the export tool silently drops shadows and animation tokens, so the script reads those from DESIGN.md directly.
**Done when:** build passes, a test class like `bg-action` works, and all 8 pages look pixel-identical.

## Phase 3 — Enforcement: lint rules + real CI (1 day)
Write custom lint rules: "no raw colour codes", "no made-up pixel values in classes", "no raw `<button>`/`<input>` inside the design-system folder". In `app/ui/` these are hard errors; in the rest of the app they are warnings for now (otherwise we would get a wall of 1,000 errors on day one). Warnings are enough for agents: your editor hook already runs lint on every file an agent edits, so the agent sees the warning immediately and fixes itself. Then upgrade the automatic checks on GitHub so every change runs lint + tests + build + the audit script ("did any number get worse?").
**Done when:** four green checks on GitHub, and typing a raw `#fff` anywhere triggers a warning.

## Phase 4 — Storybook (1 to 2 days)
Install Storybook (the modern Vite flavour; it does not care that the app itself builds with webpack). Wire it to the app's real CSS and dark theme so components look exactly as they do in Vector. Then write stories for all 15 existing components, converting each to TypeScript as its stories land. The doctrine: EVERY officially supported state is a named story (Primary, Hover, Disabled, Loading, a long-text version, and one grid showing all variants at once).
Beside each component we add a small `.meta.ts` file: is it stable or experimental, when to use it, when NOT to use it, accessibility notes. Agents can search these files as plain code, Storybook displays them on the docs page, and at build time they all merge into one JSON file an agent can query. Interactive components also get "play functions": tiny scripts that click and type inside the story and check the component responds correctly.
**Done when:** Storybook builds with 40+ stories, the accessibility checker shows no violations, and every story has its meta file.

## Phase 5 — New components (2 to 3 days, each one ships on its own)
In order of how much old mess each one cleans up:
1. **Modal**, built on the browser's native `<dialog>` element, which gives keyboard focus trapping, Escape-to-close and the dark backdrop for free, with screen-reader support built in. Corner radius follows the documented scale (12px), which means the current 20px modals visibly change; that is intentional and gets written down.
2. **Field, Input, Textarea, Select**: Field owns the label, help text and error message and wires them together properly; the controls handle their own states.
3. **Spinner** (Button's loading state needs it) and **Badge**.
4. Move the Menu components into the design-system folder, leaving a forwarding file behind so nothing else has to change yet.
**Done when:** everything is in Storybook with full state stories, and the Modal's play function proves focus stays inside and Escape closes it.

## Phase 6 — Screenshot testing + the public Storybook (1 day)
Build the screenshot safety net: a Playwright script reads Storybook's list of stories and photographs every one, then every future change is compared pixel-by-pixel against the saved photos. If a change alters 9 stories, GitHub says so, with images. The reference photos are only ever generated on Linux (in CI or Docker) because Macs render text slightly differently and would cause false alarms. Animated components are skipped or shown paused.
Then deploy Storybook as its own little website on Vercel, e.g. `ds.vector.quest`: your public, shareable design system. One gotcha to fix: the cron job in `vercel.json` would leak into the new project, so it moves to the Vercel dashboard.
**Done when:** two CI runs in a row pass with no photo churn, and the public URL is live.

## Phase 7 — Fixing the old screens, stage one (2 to 3 days, one PR per problem type)
Now protected by lint, screenshots and the audit guard rail:
1. The five scrim modals (the audit script found a fifth one, `OnboardingActions.js`, that the manual audit had missed) become the one Modal component, and their forms adopt the new Field/Input components at the same time. Roughly 700 duplicated lines deleted, and the accessibility gap closed, in one move. Take before/after screenshots for the case study.
2. The remaining hand-made inputs become Input components.
3. The 47 buttons that use the `.btn-*` CSS classes directly are near-mechanical swaps to `<Button>` (the class name literally says which variant). The ~23 fully bespoke ones get judged case by case.
After each PR the audit script proves the numbers improved, and the end-to-end tests confirm the create-task and create-onboarding flows still work. At the end, the lint warnings become hard errors in the cleaned folders.
**Done when:** roughly 80%+ of buttons and 90%+ of inputs use the components, there is one Modal in the codebase, and everything is green.

## Phase 8 — Full sweep, stage two (3 to 5 days, done in slices)
Your addition: once the worst offenders are fixed and the system has proven itself, we go back and clean up EVERYTHING else. Every remaining hand-made button and input becomes the component. The ~112 scattered hand-drawn icons move into the one shared icon file. Inline styles that just reference tokens become the new utility classes, and hardcoded numbers (like `borderRadius: 20`) become tokens. A few inline styles legitimately have to stay (drag-and-drop positioning, truly dynamic values), so we measure that realistic floor rather than chasing zero. At the end, the lint warnings become hard errors everywhere, the old-variable compatibility block is deleted (nothing uses it anymore), and the audit baseline is reset to the new, much lower floor. This runs as one small PR per screen area, each proven safe by the audit script, the screenshots and the end-to-end tests, and it can happen in parallel with phases 9 and 10.
**Done when:** the scorecard is at or near zero on every metric, lint is strict everywhere, and the compatibility scaffolding is gone.

## Phase 9 — Updating the agent instructions (half to 1 day)
- The style-right skill's token table becomes GENERATED from DESIGN.md, so it can never go stale again (that is how the two outdated colours got in).
- The design-system skill is rewritten around the new world, with the key sentence: "if the state you need has no story, you are off-road: add the story first."
- A new storybook skill teaches agents how to run it, write a story, query the story list, and update the screenshot baselines.
- CLAUDE.md gets the new-component checklist: TypeScript + locked variants + all states + a story per state + meta file + play function + accessibility clean + screenshot baseline.
**Done when:** running the build twice produces no changes (proof the generation is stable) and no stale values exist anywhere.

## Phase 10 — The portfolio piece (in the portfolio repo)
Run the audit one last time and put the two scorecards side by side. The story writes itself: raw buttons 103 → ~20 after stage one and near zero after the sweep, hand-made inputs 27 → 0, modal implementations 4 → 1, story coverage 0 → 100%, accessible dialogs 0 → all, automatic checks 1 → 6. Assets: the public Storybook link, the scorecard table, before/after modal screenshots, one diagram of the whole pipeline, and Part A presented as "here is how I would audit YOUR design system in week one", which is a killer line for founding-designer interviews.

---

## Risks and gotchas (plain version)
- The new `@theme` tokens work fine with the app's webpack build; we double-check the classes really compile as part of Phase 2.
- The token export tool drops shadows/motion, so we read those ourselves (already verified and handled).
- The corner-radius tokens nudge a few existing `rounded-lg` corners by 2px; we check where first and accept it as alignment.
- Storybook and testing-library versions need checking against Next 16 and Vitest 4 at install time; fallbacks are planned if they clash.
- Screenshot tests are famous for false alarms; every known cause (fonts, animation, Mac vs Linux rendering) has a specific counter-measure in Phase 6.
- Mixed JS/TS is safe as long as the design-system folder never imports from the app folder (already true).
- The old-variable compatibility block is scaffolding, cheap to keep; it gets deleted at the end of the stage-two sweep.
- Lint stays at "warning" outside the DS folder until the retrofit is done, so nobody drowns in a thousand errors.

## Critical files (what gets touched most)
- `scripts/build-theme.mjs`: the token generator, rewritten.
- `scripts/audit-ds.mjs`: new, the audit scorecard.
- `DESIGN.md`: gains the type scale and the overlay token, loses the lies.
- `eslint.config.mjs` + `eslint-rules/`: the new automatic rules.
- `app/ui/Button.tsx`: the template all other components copy.
- `app/ui/Modal.tsx`, `Field/Input/Textarea/Select.tsx`, `Spinner.tsx`, `Badge.tsx`, `Menu.tsx`: the new components.
- `.storybook/`, `playwright.vrt.config.ts`, `vrt/`: Storybook and screenshot testing, all new.
- `.github/workflows/ci.yml`: the expanded automatic checks.
- `skills/` + `CLAUDE.md`: the refreshed agent instructions.
