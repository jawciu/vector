/**
 * demo-snapshot.js — capture / check / restore the seeded demo portfolio.
 *
 * vector.quest is a public, writable demo. Visitors can tick tasks, drag cards,
 * and approve drafts. Most of that is harmless — a moved card is not worth
 * fixing. What matters is *structural loss*: someone deleting a whole company,
 * onboarding, or task.
 *
 * So instead of the old wipe-and-reseed (which destroyed the injected meetings
 * and their AI drafts), this script compares the live database against a
 * snapshot and reports what drifted. It never deletes anything.
 *
 *   --capture   Write the current seeded state to prisma/fixtures/demo-snapshot.json.
 *               Run this when you're happy with how the demo looks.
 *
 *   --check     Compare live vs snapshot and print a report. Exits 1 if anything
 *               was DELETED (that's what the nightly job alerts on). Edits and
 *               additions are reported as information and exit 0.
 *
 *   --restore   Re-create only the things that are MISSING (companies,
 *               onboardings, phases, tasks, contacts). Never deletes, never
 *               overwrites a row that still exists — a visitor's edits survive.
 *               Dry-run unless combined with --write.
 *
 * Scope: only companies with a logoUrl (the seeded portfolio). The legacy corpus
 * is never read or touched.
 *
 * Note on AI content: ExternalEvents and PendingAIChanges are checked but NOT
 * restored — recreating drafts means re-running the orchestrator, which costs
 * Anthropic credits. If an onboarding is deleted its drafts cascade away; the
 * report says so and you re-run `node scripts/inject-meetings.js`.
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = `${HERE}/../prisma/fixtures/demo-snapshot.json`;

const args = process.argv.slice(2);
const MODE = args.find((a) => ["--capture", "--check", "--restore"].includes(a));
const WRITE = args.includes("--write");

const SEEDED = { logoUrl: { not: null } };
const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Natural keys — stable across deletes/recreates, unlike auto-increment ids. */
const onboardingKey = (prefix, createdAt) => `${prefix}|${iso(createdAt)}`;
const taskKey = (prefix, number) => `${prefix}-${number}`;

async function readLive() {
  const companies = await prisma.company.findMany({
    where: SEEDED,
    orderBy: { prefix: "asc" },
    include: {
      onboardings: {
        orderBy: { createdAt: "asc" },
        include: {
          phases: { orderBy: { sortOrder: "asc" } },
          contacts: { orderBy: { email: "asc" } },
          tasks: {
            orderBy: { number: "asc" },
            include: { phase: { select: { name: true } }, blockedByTask: { select: { number: true } } },
          },
        },
      },
    },
  });

  const events = await prisma.externalEvent.findMany({
    where: { source: "miniti", onboarding: { company: SEEDED } },
    select: { sourceId: true, matchAmbiguous: true, _count: { select: { pendingChanges: true } } },
    orderBy: { sourceId: "asc" },
  });

  return {
    capturedAt: iso(new Date()),
    companies: companies.map((c) => ({
      prefix: c.prefix,
      name: c.name,
      domain: c.domain,
      logoUrl: c.logoUrl,
      taskCounter: c.taskCounter,
      onboardings: c.onboardings.map((o) => ({
        key: onboardingKey(c.prefix, o.createdAt),
        createdAt: iso(o.createdAt),
        status: o.status,
        owner: o.owner,
        targetGoLive: iso(o.targetGoLive),
        phases: o.phases.map((p) => ({ name: p.name, sortOrder: p.sortOrder, isComplete: p.isComplete, targetDate: iso(p.targetDate) })),
        contacts: o.contacts.map((ct) => ({ name: ct.name, email: ct.email, role: ct.role })),
        tasks: o.tasks.map((t) => ({
          key: taskKey(c.prefix, t.number),
          number: t.number,
          title: t.title,
          status: t.status,
          due: t.due,
          priority: t.priority,
          phaseName: t.phase?.name ?? null,
          description: t.description,
          notes: t.notes,
          sortOrder: t.sortOrder,
          owner: t.owner || null,
          // Dependency by task number, not id: ids churn when a task is restored.
          blockedByNumber: t.blockedByTask?.number ?? null,
        })),
      })),
    })),
    events: events.map((e) => ({ sourceId: e.sourceId, ambiguous: e.matchAmbiguous, drafts: e._count.pendingChanges })),
  };
}

function loadSnapshot() {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  } catch {
    throw new Error(`No snapshot at ${SNAPSHOT_PATH}. Run with --capture first.`);
  }
}

/** Flatten a snapshot into lookup maps keyed by natural key. */
function index(snap) {
  const companies = new Map();
  const onboardings = new Map();
  const tasks = new Map();
  const contacts = new Map();
  const events = new Map();
  for (const c of snap.companies) {
    companies.set(c.prefix, c);
    for (const o of c.onboardings) {
      onboardings.set(o.key, { ...o, prefix: c.prefix });
      for (const t of o.tasks) tasks.set(t.key, { ...t, onboardingKey: o.key, prefix: c.prefix });
      for (const ct of o.contacts) contacts.set(`${o.key}|${ct.email}`, { ...ct, onboardingKey: o.key });
    }
  }
  for (const e of snap.events) events.set(e.sourceId, e);
  return { companies, onboardings, tasks, contacts, events };
}

function diff(expected, actual) {
  const E = index(expected);
  const A = index(actual);
  const deleted = [];
  const added = [];
  const edited = [];

  const sweep = (name, e, a, describe, compare) => {
    for (const [k, v] of e) {
      const live = a.get(k);
      if (!live) { deleted.push(`${name}: ${describe(v, k)}`); continue; }
      if (compare) {
        const changes = compare(v, live);
        if (changes.length) edited.push(`${name}: ${describe(v, k)} — ${changes.join(", ")}`);
      }
    }
    for (const [k, v] of a) if (!e.has(k)) added.push(`${name}: ${describe(v, k)}`);
  };

  sweep("company", E.companies, A.companies, (v) => `${v.name} (${v.prefix})`);
  sweep("onboarding", E.onboardings, A.onboardings, (v, k) => `${v.prefix} created ${k.split("|")[1]?.slice(0, 10)}`,
    (e, a) => {
      const c = [];
      if (e.status !== a.status) c.push(`status ${e.status} → ${a.status}`);
      if (e.targetGoLive !== a.targetGoLive) c.push("go-live date changed");
      return c;
    });
  sweep("task", E.tasks, A.tasks, (v, k) => `${k} "${v.title.slice(0, 44)}"`,
    (e, a) => {
      const c = [];
      if (e.status !== a.status) c.push(`status ${e.status} → ${a.status}`);
      if (e.title !== a.title) c.push("title edited");
      if (e.due !== a.due) c.push(`due ${e.due} → ${a.due}`);
      if (e.priority !== a.priority) c.push(`priority ${e.priority} → ${a.priority}`);
      if (e.owner !== a.owner) c.push(`owner ${e.owner ?? "none"} → ${a.owner ?? "none"}`);
      if (e.blockedByNumber !== a.blockedByNumber) c.push(`dependency ${e.blockedByNumber ?? "none"} → ${a.blockedByNumber ?? "none"}`);
      return c;
    });
  sweep("contact", E.contacts, A.contacts, (v) => `${v.name} <${v.email}>`);
  sweep("meeting", E.events, A.events, (v) => `${v.sourceId.slice(0, 8)}… (${v.drafts} drafts)`,
    (e, a) => (e.drafts !== a.drafts ? [`drafts ${e.drafts} → ${a.drafts}`] : []));

  return { deleted, added, edited };
}

async function restore(expected) {
  const actual = await readLive();
  const A = index(actual);
  const created = [];

  for (const c of expected.companies) {
    let company = await prisma.company.findUnique({ where: { prefix: c.prefix } });
    if (!company) {
      company = await prisma.company.create({
        data: { name: c.name, prefix: c.prefix, domain: c.domain, logoUrl: c.logoUrl, taskCounter: c.taskCounter },
      });
      created.push(`company ${c.name}`);
    }

    for (const o of c.onboardings) {
      let ob = A.onboardings.get(o.key)
        ? await prisma.onboarding.findFirst({ where: { companyId: company.id, createdAt: new Date(o.createdAt) } })
        : null;
      if (!ob) {
        ob = await prisma.onboarding.create({
          data: {
            companyId: company.id,
            status: o.status,
            owner: o.owner,
            targetGoLive: o.targetGoLive ? new Date(o.targetGoLive) : null,
            createdAt: new Date(o.createdAt),
          },
        });
        created.push(`onboarding ${c.prefix} (${o.status})`);
      }

      const phaseByName = new Map();
      for (const p of o.phases) {
        let phase = await prisma.phase.findFirst({ where: { onboardingId: ob.id, name: p.name } });
        if (!phase) {
          phase = await prisma.phase.create({
            data: { onboardingId: ob.id, name: p.name, sortOrder: p.sortOrder, isComplete: p.isComplete, targetDate: p.targetDate ? new Date(p.targetDate) : null },
          });
          created.push(`phase ${c.prefix}/${p.name}`);
        }
        phaseByName.set(p.name, phase.id);
      }

      for (const ct of o.contacts) {
        const existing = await prisma.contact.findFirst({ where: { onboardingId: ob.id, email: ct.email } });
        if (!existing) {
          await prisma.contact.create({ data: { onboardingId: ob.id, name: ct.name, email: ct.email, role: ct.role } });
          created.push(`contact ${ct.email}`);
        }
      }

      for (const t of o.tasks) {
        const existing = await prisma.task.findFirst({ where: { companyId: company.id, number: t.number } });
        if (existing) continue;
        const phaseId = phaseByName.get(t.phaseName) ?? [...phaseByName.values()][0];
        await prisma.task.create({
          data: {
            onboardingId: ob.id,
            companyId: company.id, // must equal Onboarding.companyId — DB trigger enforces it
            number: t.number,
            phaseId,
            title: t.title,
            status: t.status,
            due: t.due,
            priority: t.priority,
            description: t.description ?? "",
            notes: t.notes ?? "",
            sortOrder: t.sortOrder ?? 0,
          },
        });
        created.push(`task ${t.key}`);
      }

      // Keep the per-company counter ahead of every restored number.
      const max = await prisma.task.aggregate({ where: { companyId: company.id }, _max: { number: true } });
      if ((max._max.number ?? 0) > company.taskCounter) {
        await prisma.company.update({ where: { id: company.id }, data: { taskCounter: max._max.number } });
      }
    }
  }
  return created;
}

async function main() {
  if (!MODE) {
    console.error("Usage: demo-snapshot.js (--capture | --check | --restore [--write])");
    process.exit(2);
  }

  if (MODE === "--capture") {
    const live = await readLive();
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(live, null, 2));
    const tasks = live.companies.reduce((n, c) => n + c.onboardings.reduce((m, o) => m + o.tasks.length, 0), 0);
    const obs = live.companies.reduce((n, c) => n + c.onboardings.length, 0);
    console.log(`Captured ${live.companies.length} companies, ${obs} onboardings, ${tasks} tasks, ${live.events.length} meetings`);
    console.log(`→ ${SNAPSHOT_PATH}`);
    await prisma.$disconnect();
    return;
  }

  const snapshot = loadSnapshot();

  if (MODE === "--check") {
    const live = await readLive();
    const { deleted, added, edited } = diff(snapshot, live);

    console.log(`Snapshot taken ${snapshot.capturedAt}\n`);
    if (deleted.length) {
      console.log(`❌ DELETED (${deleted.length}) — structural loss, restore recommended`);
      deleted.forEach((d) => console.log(`   - ${d}`));
    } else {
      console.log("✅ Nothing deleted. The seeded portfolio is structurally intact.");
    }
    if (edited.length) {
      console.log(`\n✏️  EDITED (${edited.length}) — visitor activity, no action needed`);
      edited.slice(0, 25).forEach((d) => console.log(`   - ${d}`));
      if (edited.length > 25) console.log(`   … and ${edited.length - 25} more`);
    }
    if (added.length) {
      console.log(`\n➕ ADDED (${added.length}) — created since the snapshot`);
      added.slice(0, 15).forEach((d) => console.log(`   - ${d}`));
      if (added.length > 15) console.log(`   … and ${added.length - 15} more`);
    }

    await prisma.$disconnect();
    process.exit(deleted.length ? 1 : 0);
  }

  if (MODE === "--restore") {
    if (!WRITE) {
      const live = await readLive();
      const { deleted } = diff(snapshot, live);
      console.log(deleted.length ? `Would restore ${deleted.length} missing rows:` : "Nothing missing — nothing to restore.");
      deleted.forEach((d) => console.log(`   + ${d}`));
      console.log("\nDRY RUN — nothing written. Add --write to apply.");
      await prisma.$disconnect();
      return;
    }
    const created = await restore(snapshot);
    console.log(created.length ? `Restored ${created.length} rows:` : "Nothing missing — nothing restored.");
    created.forEach((c) => console.log(`   + ${c}`));
    console.log("\nNote: AI drafts are not restored. If an onboarding was recreated,");
    console.log("re-run `node scripts/inject-meetings.js` to rebuild its meetings.");
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
