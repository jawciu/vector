import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r = await c.query(
  `SELECT id, status, payload->>'taskId' AS task_id, payload->>'ownerId' AS owner_id,
          "appliedTaskId", "resolvedAt", "resolvedBy"
   FROM "PendingAIChange"
   WHERE action = 'draft_followup'
   ORDER BY "createdAt" DESC
   LIMIT 20`
);
console.log("All draft_followup rows (newest first):");
console.table(r.rows);

await c.end();
