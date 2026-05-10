/**
 * One-shot cleanup: mark all pending PendingAIChange rows of action type
 * `match_existing` with sub-action `comment_only` as rejected, with the
 * reason "retired action type".
 *
 * Background: `comment_only` was removed from the orchestrator schema on
 * 2026-05-10 — new drafts won't be produced, but legacy rows linger and
 * surface in the inbox as a "Update task" fallback card. This retires
 * those rows so they drop out of pending without losing the audit trail.
 *
 * Run: node scripts/retire-comment-only-drafts.js
 *
 * Idempotent — only touches `pending` rows, so re-running is a no-op.
 */

import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r = await c.query(`
  UPDATE "PendingAIChange"
  SET    "status" = 'rejected',
         "rejectedReason" = 'retired action type',
         "resolvedAt" = NOW()
  WHERE  "status" = 'pending'
    AND  "action" = 'match_existing'
    AND  "payload"->>'action' = 'comment_only'
  RETURNING id
`);

console.log(`Retired ${r.rowCount} legacy comment_only draft(s).`);

await c.end();
