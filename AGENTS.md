# Repository Instructions

## Global Claude Skills
- Before starting substantial work, check `/Users/caro/.claude/skills/skill-router/SKILL.md` when the task may benefit from Claude skills.
- When relevant, use the applicable skills from `/Users/caro/.claude/skills` as reference material.
- Load only the skill files needed for the current task. Prefer `skill-router` first when the right skill is not obvious.

## MCP Configuration
- Treat `/Users/caro/.claude/settings.json` as the source of truth for Claude MCP configuration available on disk.
- Do not assume live MCP runtime access in this environment unless the relevant tools are actually exposed in the current session.
- If a task depends on MCP, inspect the on-disk configuration first and then state clearly whether live access is available.
