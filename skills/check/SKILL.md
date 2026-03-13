---
name: check
description: Run build, lint, and Prisma validation to verify the project is healthy. Use when the user asks to check, validate, or verify the project, or after making significant changes.
disable-model-invocation: true
---

# Project Health Check

Run these checks in order. Stop at the first failure and report the issue.

## 1. Prisma schema validation

```bash
npx prisma validate
```

If this fails, the schema has syntax errors — fix before proceeding.

## 2. Prisma client generation

```bash
npx prisma generate
```

Ensures the generated client matches the current schema.

## 3. ESLint

```bash
npx eslint .
```

Check for lint errors. Warnings are acceptable, errors must be fixed.

## 4. Build

```bash
npm run build
```

This runs `next build --webpack`. If it fails, check the error output for:
- Import errors (missing modules, wrong paths)
- Server/client component boundary issues
- Dynamic route params not awaited

## Reporting

After all checks pass, report a one-line summary. If any check fails, report:
1. Which check failed
2. The error message
3. A suggested fix
