import "dotenv/config";
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const OVERDUE = 5;

const today = new Date();
const cutoff = new Date(today.getTime() - OVERDUE * 86400000);

const obs = await c.query(`SELECT id, "companyId", status FROM "Onboarding" WHERE status = 'Active'`);
console.log(`Active onboardings: ${obs.rows.length}`);

const totals = { tasks: 0, owned: 0, stale: 0, ownedAndStale: 0 };
for (const ob of obs.rows) {
  const tasks = await c.query(
    `SELECT id, title, status, due, "ownerId" FROM "Task" WHERE "onboardingId" = $1`,
    [ob.id]
  );
  totals.tasks += tasks.rows.length;
  for (const t of tasks.rows) {
    const owned = t.ownerId != null;
    const overdue = t.due && new Date(t.due) <= cutoff;
    const blocked = t.status === "Blocked";
    const stale = (overdue || blocked) && t.status !== "Done";
    if (owned) totals.owned += 1;
    if (stale) totals.stale += 1;
    if (owned && stale) {
      totals.ownedAndStale += 1;
      console.log(
        `  • task #${t.id} (ob ${ob.id}) — ownerId=${t.ownerId}, status=${t.status}, due=${t.due ?? "—"}${overdue ? ` (overdue)` : ""}${blocked ? ` (blocked)` : ""}: ${t.title}`
      );
    }
  }
}

console.log(`\nTotals across active onboardings:`);
console.log(`  tasks: ${totals.tasks}`);
console.log(`  with ownerId: ${totals.owned}`);
console.log(`  stale (overdue ≥${OVERDUE}d or blocked, not Done): ${totals.stale}`);
console.log(`  stale AND owned: ${totals.ownedAndStale}`);

const vu = await c.query(`SELECT id, name, email FROM "VendorUser"`);
console.log(`\nVendorUsers in DB:`);
for (const v of vu.rows) console.log(`  id=${v.id}  ${v.name} <${v.email}>`);

await c.end();
