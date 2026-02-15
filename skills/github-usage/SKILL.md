---
name: github-usage
description: Manage GitHub operations for this project using the gh CLI and git. Use when the user asks to commit, push, create repos, open PRs, change repo settings, or perform any GitHub-related task.
---

# GitHub Usage

## Project context

- **GitHub account**: `jawciu`
- **Repository**: `jawciu/valign` (public)
- **Remote**: `origin` via HTTPS
- **Default branch**: `main`
- **CLI tool**: `gh` (GitHub CLI), authenticated via `gh auth login`

## Committing changes

1. Always run `git status` and `git diff` first to understand what changed.
2. Write a concise commit message — short title line focused on the "why", bullet points for details.
3. Use a HEREDOC for multi-line messages:

```bash
git commit -m "$(cat <<'EOF'
Short title here

- Detail 1
- Detail 2
EOF
)"
```

4. **Do not push automatically** — only push when the user explicitly asks.
5. Exclude IDE/editor config (`.vscode/`, `.idea/`) from commits unless asked.

## Pushing to GitHub

```bash
git push origin main
```

- Always require `full_network` or `all` sandbox permissions for push/fetch.
- If `origin` remote is missing, add it: `git remote add origin https://github.com/jawciu/valign.git`

## Amending commits

Only amend if:
- The user explicitly asks to change the commit message or contents
- The commit hasn't been pushed, OR the user accepts a force push
- The commit was created in the current session

If already pushed, warn about force push and only proceed with user confirmation:

```bash
git commit --amend -m "new message"
git push --force origin main
```

## Creating repositories

Use `gh repo create` with the project directory as source:

```bash
gh repo create jawciu/<name> --public --source=. --remote=origin --push --description "Description"
```

- Default to **public** unless told otherwise.
- Requires `all` sandbox permissions (auth token + network).

## Changing repo settings

```bash
# Visibility
gh repo edit jawciu/valign --visibility public --accept-visibility-change-consequences

# Description, homepage, topics
gh repo edit jawciu/valign --description "New description"
gh repo edit jawciu/valign --add-topic nextjs --add-topic onboarding
```

## Pull requests

```bash
git push -u origin HEAD
gh pr create --title "PR title" --body "$(cat <<'EOF'
## Summary
- Change 1
- Change 2

## Test plan
- [ ] Verify X
EOF
)"
```

## Auth troubleshooting

If `gh auth status` shows an invalid token, ask the user to run:

```bash
gh auth login -h github.com
```

Choose **HTTPS** and **Login with a web browser**. Requires `all` sandbox permissions to verify auth status.

## Sandbox permissions

| Operation | Permission needed |
|-----------|------------------|
| `git status`, `git diff`, `git log` | None (local) |
| `git fetch`, `git push`, `gh` commands | `full_network` or `all` |
| `gh auth status` (reads keyring) | `all` |
