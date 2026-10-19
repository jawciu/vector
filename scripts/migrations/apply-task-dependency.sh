#!/bin/bash
# Apply migration 20261013120000_add_task_dependency by hand (the Supabase shadow
# database cannot replay the auth schema, so `prisma migrate dev` cannot).
#
# RUN IT, DON'T SOURCE OR PASTE IT:
#   DIRECT_DATABASE_URL='<target>' bash scripts/migrations/apply-task-dependency.sh dry-run
#   DIRECT_DATABASE_URL='<target>' bash scripts/migrations/apply-task-dependency.sh apply
#
# Target: DIRECT_DATABASE_URL, which must be set explicitly on the command line
# (the script refuses to fall back to .env, so the target is always a deliberate
# choice). prisma.config.ts and the check script both read it. Every step checks the
# previous one's exit code; `migrate resolve` only runs after the verify step
# has passed.
cd "$(dirname "$0")/../.." || exit 2
MIG=20261013120000_add_task_dependency
SQL=prisma/migrations/$MIG/migration.sql
CHECK=scripts/migrations/task-dependency-check.mjs
mode="${1:-}"
if [ "$mode" != "dry-run" ] && [ "$mode" != "apply" ]; then
  echo "usage: DIRECT_DATABASE_URL='<target>' bash $0 dry-run|apply"; exit 2
fi
if [ -z "${DIRECT_DATABASE_URL:-}" ]; then
  echo "STOP: set DIRECT_DATABASE_URL explicitly for the database you mean to change, e.g."
  echo "  DIRECT_DATABASE_URL='postgresql://...' bash $0 $mode"
  echo "The script does not fall back to .env, so it never picks a target for you."
  exit 2
fi
export DIRECT_DATABASE_URL
TARGET=$(node -e 'const u=new URL(process.env.DIRECT_DATABASE_URL);console.log(u.hostname+":"+(u.port||5432)+u.pathname)')
echo "Target database: $TARGET"

echo "== 1. dry run (BEGIN ... ROLLBACK)"
node "$CHECK" dry-run
rc=$?
if [ $rc -ne 0 ]; then echo "STOP: dry run failed (exit $rc). Nothing was written."; exit 1; fi
[ "$mode" = "dry-run" ] && { echo "Dry run passed. Nothing was written."; exit 0; }

echo
echo "== 2. migrate status (exits 1 while a migration is pending; that is expected)"
npx prisma migrate status
echo "(status exit $? ignored)"

echo
read -r -p "Type APPLY to write migration $MIG to $TARGET: " answer
if [ "$answer" != "APPLY" ]; then echo "Not applied."; exit 1; fi

echo "== 3. db execute"
npx prisma db execute --file "$SQL"
rc=$?
if [ $rc -ne 0 ]; then echo "STOP: db execute failed (exit $rc). Do not resolve."; exit 1; fi

echo "== 4. verify"
node "$CHECK" verify
rc=$?
if [ $rc -ne 0 ]; then echo "STOP: verify failed (exit $rc). Do not resolve; investigate first."; exit 1; fi

echo "== 5. migrate resolve"
npx prisma migrate resolve --applied "$MIG"
rc=$?
if [ $rc -ne 0 ]; then echo "STOP: migrate resolve failed (exit $rc)."; exit 1; fi

echo "== 6. migrate status (must be up to date)"
npx prisma migrate status
rc=$?
if [ $rc -ne 0 ]; then echo "STOP: status still reports a problem (exit $rc)."; exit 1; fi
echo "Done: $MIG applied, verified and recorded."
