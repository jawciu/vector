import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const me = await c.query(
  `SELECT id, name, email FROM "VendorUser" WHERE email = 'jaworskycaroline@gmail.com'`
);
const meId = me.rows[0]?.id;
console.log(`You: ${me.rows[0]?.name} (id=${meId})`);

const today = new Date();
const cutoff = new Date(today.getTime() - 5 * 86400000);

const stale = await c.query(
  `SELECT t.id, t.title, t.status, t.due, t."ownerId", v.name AS owner_name
   FROM "Task" t
   LEFT JOIN "VendorUser" v ON v.id = t."ownerId"
   WHERE t."ownerId" = $1
     AND t.status != 'Done'
     AND (t.status = 'Blocked' OR (t.due != '' AND to_date(NULLIF(t.due, ''), 'YYYY-MM-DD') <= $2))`,
  [meId, cutoff]
);
console.log(`\nYour stale + owned tasks (would be picked up by scan):`);
for (const t of stale.rows) {
  console.log(`  • #${t.id} "${t.title}" — status=${t.status}, due=${t.due ?? "—"}`);
}

const pending = await c.query(
  `SELECT id, "onboardingId", payload, "createdAt"
   FROM "PendingAIChange"
   WHERE action = 'draft_followup' AND status = 'pending'
   ORDER BY "createdAt" DESC`
);
console.log(`\nPending draft_followup drafts:`);
for (const r of pending.rows) {
  console.log(
    `  • draft #${r.id} for task #${r.payload?.taskId} (ownerId=${r.payload?.ownerId}) — created ${r.createdAt.toISOString()}`
  );
}

const staleIds = new Set(stale.rows.map((r) => r.id));
const overlap = pending.rows.filter((r) => staleIds.has(Number(r.payload?.taskId)));
console.log(
  `\nOverlap (tasks both stale AND with a pending draft → these are what gets skipped): ${overlap.length}`
);
for (const r of overlap) {
  console.log(`  → task #${r.payload?.taskId} already has draft #${r.id}`);
}

await c.end();
