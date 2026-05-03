/**
 * One-time backfill: set Task.ownerId from Task.owner where the owner string
 * matches a VendorUser.name. Safe to re-run — only touches rows where ownerId
 * is currently NULL.
 *
 * Run: node scripts/backfill-task-owner-id.js
 *
 * Tasks whose `owner` string doesn't match any VendorUser are left alone.
 * Those are typically customer contacts that were misassigned as owners under
 * the old picker — Caroline can fix them by hand or move them to Assignee.
 */

import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const vendors = await c.query(`SELECT id, name FROM "VendorUser"`);
console.log(`Found ${vendors.rows.length} VendorUser(s).`);

let totalUpdated = 0;
for (const v of vendors.rows) {
  const r = await c.query(
    `UPDATE "Task" SET "ownerId" = $1
     WHERE "ownerId" IS NULL AND owner = $2
     RETURNING id`,
    [v.id, v.name]
  );
  if (r.rowCount > 0) {
    console.log(`  → ${v.name}: matched ${r.rowCount} task(s)`);
    totalUpdated += r.rowCount;
  } else {
    console.log(`  → ${v.name}: no matches`);
  }
}

const remaining = await c.query(
  `SELECT COUNT(*)::int AS n FROM "Task"
   WHERE "ownerId" IS NULL AND owner != ''`
);
console.log(`\nUpdated ${totalUpdated} task(s).`);
console.log(
  `${remaining.rows[0].n} task(s) still have a non-empty owner string but no ownerId — typically customer contact names that should be moved to Assignee.`
);

await c.end();
