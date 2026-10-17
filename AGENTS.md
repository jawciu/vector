# Vector onboarding workspace

Vector is the B2B onboarding workspace. It uses Next.js, Prisma, Supabase, and a shared design-system layer.

## Start here

- For continuation work, read `docs/agent-state.md`, then verify Git state and the relevant plan or runbook.
- `DESIGN.md`, `AI_PLAN.md`, `EVALS_PLAN.md`, and `docs/DS-PLAN.md` own their respective detailed decisions and plans.
- Historical handoffs are in `docs/agent-history/`; do not treat them as current state.

## Safety

- The local environment can point at a real demo database. Treat data-changing operations as production-sensitive: inspect the target, use dry runs or a reversible snapshot, and never delete, revoke, upload, or send anything unless the task explicitly requires it.
- Authentication and access boundaries are security-sensitive. Preserve server-side guards and verify the relevant flow after changing them.
- Do not commit or push without Caroline's explicit approval in the current conversation.

## Working conventions

- Use the existing design-system components and tokens. Read `DESIGN.md` before visual-system work.
- Keep the vendor interface desktop-only as designed; the customer portal is intentionally mobile-friendly.
- Preserve the single health-calculation path. Do not create competing status logic.
- For database changes, read the relevant migration/runbook before acting; never infer Prisma commands from an old handoff.

## Project skills

Project skills have one source of truth in `.agents/skills/`. The `skills/` and `.claude/skills/` paths are compatibility links to that same directory; do not create copies.

- `check` — validate work before handoff.
- `design-system` — work within Vector's design-system rules.
- `extract` — safely extract structured information.
- `figma-usage` — use Figma-related workflows.
- `github-usage` — GitHub-specific work.
- `new-feature` — plan and build a feature.
- `prisma-usage` — Prisma schema and database workflows.
- `review` — review changes before handoff.
- `style-right` — preserve established interface styling.
- `supabase-usage` — Supabase-specific workflows.
- `tailwind-css-v4` — Tailwind v4 conventions.

Shared personal skills, including `session-journal` and `caroline-writing-voice`, live in `~/.agents/skills/`. Use the relevant skill before starting work in its area.

## Verification

- Run the narrowest relevant verification first. For code changes, use the established lint, type, unit, e2e, Storybook, or eval workflow documented in the affected plan.
- For substantial design-system work, use the design-system documentation and visual review path before declaring it complete.
