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
 *   --restore-state
 *               Put the seeded rows back the way the snapshot has them:
 *               task status/due/owner/assignee/priority/phase/order, phase
 *               names and order, onboarding status/owner/go-live, contact
 *               fields; delete the tasks, comments, files, magic links,
 *               activity and notifications a visitor added that the snapshot
 *               does not know about; and put drafts a visitor approved or
 *               rejected back to pending, deleting the tasks those approvals
 *               created. Dry-run unless combined with --write.
 *               `--only RAY,CHOW` narrows it to those company prefixes.
 *
 *               A category is only touched when the snapshot actually holds
 *               it. An old snapshot has no comments or drafts in it, so there
 *               is no way to tell a seeded row from a visitor's, and those
 *               categories are reported as skipped rather than guessed at.
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeHealth } from "../lib/health.js";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = `${HERE}/../prisma/fixtures/demo-snapshot.json`;

const args = process.argv.slice(2);
const MODE = args.find((a) => ["--capture", "--check", "--restore", "--restore-state"].includes(a));
const WRITE = args.includes("--write");
const ONLY = (args.find((a) => a.startsWith("--only="))?.slice(7)
  ?? (args.includes("--only") ? args[args.indexOf("--only") + 1] : null))
  ?.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean) ?? null;

const SEEDED = { logoUrl: { not: null } };
const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Natural keys — stable across deletes/recreates, unlike auto-increment ids. */
const onboardingKey = (prefix, createdAt) => `${prefix}|${iso(createdAt)}`;
const taskKey = (prefix, number) => `${prefix}-${number}`;

/**
 * Rows that have no unique column of their own (comments, activity, drafts)
 * get a composite key. Two rows can still collide, so repeats are numbered.
 */
function keyer() {
  const seen = new Map();
  return (...parts) => {
    const base = parts.map((p) => (p == null ? "" : String(p))).join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
}

/**
 * Natural keys for every child collection of one onboarding, computed once so
 * capture and restore-state can never drift apart. Each entry is
 * [key, liveRow, extra].
 */
function categoryKeys(prefix, o) {
  const numberById = new Map(o.tasks.map((t) => [t.id, t.number]));
  const ck = keyer(), fk = keyer(), ak = keyer(), nk = keyer(), dk = keyer();
  return {
    numberById,
    comments: o.tasks.flatMap((t) =>
      t.comments.map((cm) => [ck(taskKey(prefix, t.number), iso(cm.createdAt), cm.author), cm, t.number])),
    files: o.files.map((f) => [fk(f.fileName, iso(f.createdAt)), f]),
    magicLinks: o.magicLinks.map((m) => [m.token, m]),
    activity: o.activities.map((a) => [ak(a.verb, a.entityType, a.entityId, iso(a.createdAt)), a]),
    notifications: o.activities.flatMap((a) =>
      a.notifications.map((n) => [nk(n.groupKey, n.recipientType, iso(n.createdAt)), n])),
    drafts: o.pendingChanges.map((d) => [dk(d.action, iso(d.createdAt), (d.sourceQuote ?? "").slice(0, 48)), d]),
  };
}

/** The one query. readLive() projects it; restoreState() needs the ids. */
async function fetchCompanies() {
  return prisma.company.findMany({
    where: SEEDED,
    orderBy: { prefix: "asc" },
    include: {
      onboardings: {
        orderBy: { createdAt: "asc" },
        include: {
          ownerUser: { select: { email: true } },
          phases: { orderBy: { sortOrder: "asc" } },
          contacts: { orderBy: { email: "asc" } },
          magicLinks: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { contact: { select: { email: true } } } },
          files: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          activities: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { notifications: { orderBy: { id: "asc" } } },
          },
          pendingChanges: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { sourceEvent: { select: { sourceId: true } } },
          },
          tasks: {
            orderBy: { number: "asc" },
            include: {
              phase: { select: { name: true } },
              blockedByTask: { select: { number: true } },
              ownerUser: { select: { email: true } },
              assigneeContact: { select: { email: true } },
              comments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            },
          },
        },
      },
    },
  });
}

async function readLive() {
  const companies = await fetchCompanies();

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
      onboardings: c.onboardings.map((o) => {
        const K = categoryKeys(c.prefix, o);
        return {
          key: onboardingKey(c.prefix, o.createdAt),
          createdAt: iso(o.createdAt),
          updatedAt: iso(o.updatedAt),
          status: o.status,
          owner: o.owner,
          ownerEmail: o.ownerUser?.email ?? null,
          targetGoLive: iso(o.targetGoLive),
          phases: o.phases.map((p) => ({ name: p.name, sortOrder: p.sortOrder, isComplete: p.isComplete, targetDate: iso(p.targetDate) })),
          contacts: o.contacts.map((ct) => ({
            name: ct.name,
            email: ct.email,
            role: ct.role,
            lastSeenPortalAt: iso(ct.lastSeenPortalAt),
            bouncedAt: iso(ct.bouncedAt),
          })),
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
            // People by email, not id: ids churn, emails are the natural key.
            ownerEmail: t.ownerUser?.email ?? null,
            assigneeEmail: t.assigneeContact?.email ?? null,
            members: t.members ?? [],
            previousStatus: t.previousStatus ?? null,
            // Dependency by task number, not id: ids churn when a task is restored.
            blockedByNumber: t.blockedByTask?.number ?? null,
          })),
          comments: K.comments.map(([key, cm, number]) => ({
            key, taskNumber: number, author: cm.author, body: cm.body, createdAt: iso(cm.createdAt),
          })),
          files: K.files.map(([key, f]) => ({
            key, fileName: f.fileName, taskNumber: K.numberById.get(f.taskId) ?? null, createdAt: iso(f.createdAt),
          })),
          magicLinks: K.magicLinks.map(([token, m]) => ({
            token,
            contactEmail: m.contact?.email ?? null,
            createdAt: iso(m.createdAt),
            expiresAt: iso(m.expiresAt),
            revokedAt: iso(m.revokedAt),
            lastUsedAt: iso(m.lastUsedAt),
            sentAt: iso(m.sentAt),
          })),
          activity: K.activity.map(([key, a]) => ({
            key, verb: a.verb, entityType: a.entityType, entityId: a.entityId, actorType: a.actorType, createdAt: iso(a.createdAt),
          })),
          notifications: K.notifications.map(([key, n]) => ({
            key, groupKey: n.groupKey, recipientType: n.recipientType, readAt: iso(n.readAt), archivedAt: iso(n.archivedAt), createdAt: iso(n.createdAt),
          })),
          // Drafts are seeded content: the meeting pipeline produced them and
          // they cost Anthropic credits to rebuild. A visitor resolving one is
          // an edit to be undone, not a row to be deleted.
          drafts: K.drafts.map(([key, d]) => ({
            key,
            action: d.action,
            status: d.status,
            confidence: d.confidence,
            sourceEventSourceId: d.sourceEvent?.sourceId ?? null,
            sourceQuote: d.sourceQuote,
            createdAt: iso(d.createdAt),
            resolvedAt: iso(d.resolvedAt),
            rejectedReason: d.rejectedReason,
            appliedTaskNumber: d.appliedTaskId == null ? null : K.numberById.get(d.appliedTaskId) ?? null,
          })),
        };
      }),
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

/* ── restore-state ─────────────────────────────────────────────────────── */

/**
 * Fields on a Task that a visitor can move, paired with the column they map
 * to. Anything the snapshot does not carry is left alone, so an old snapshot
 * degrades to "restore what I actually know" instead of guessing.
 */
const TASK_FIELDS = ["title", "status", "due", "priority", "description", "notes", "sortOrder", "owner", "previousStatus"];
const CONTACT_FIELDS = ["name", "role"];

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const same = (a, b) => (a ?? null) === (b ?? null);

/**
 * Work out everything that has to change to put the seeded rows back the way
 * the snapshot has them. Returns ops (each with a `run(tx)`), so the dry run
 * and the write share one code path and can never disagree.
 */
export function planRestoreState(snapshot, companies, { only = null, vendorByEmail = new Map() } = {}) {
  const ops = [];
  const skipped = [];
  // Categories the snapshot does not carry. Reported once, not once per
  // onboarding: it is one fact about the snapshot, not twelve problems.
  const inert = new Set();
  const health = [];
  const add = (table, verb, label, run) => ops.push({ table, verb, label, run });

  const liveByKey = new Map();
  for (const c of companies) {
    for (const o of c.onboardings) liveByKey.set(onboardingKey(c.prefix, o.createdAt), { company: c, ob: o });
  }

  for (const c of snapshot.companies) {
    if (only && !only.includes(c.prefix)) continue;
    for (const sob of c.onboardings) {
      const hit = liveByKey.get(sob.key);
      if (!hit) {
        skipped.push(`${c.prefix}: onboarding ${sob.key} is missing from the database. Run --restore --write first.`);
        continue;
      }
      const { ob } = hit;
      const K = categoryKeys(c.prefix, ob);
      const P = `${c.prefix}`;

      // --- onboarding ---------------------------------------------------
      const obChanges = [];
      if (!same(ob.status, sob.status)) obChanges.push(`status ${ob.status} → ${sob.status}`);
      if (!same(iso(ob.targetGoLive), sob.targetGoLive)) obChanges.push("go-live");
      if (!same(ob.owner, sob.owner)) obChanges.push(`owner ${ob.owner} → ${sob.owner}`);
      const wantOwnerId = has(sob, "ownerEmail")
        ? (sob.ownerEmail == null ? null : vendorByEmail.get(sob.ownerEmail) ?? ob.ownerId)
        : ob.ownerId;
      if (!same(ob.ownerId, wantOwnerId)) obChanges.push("ownerId");
      const wantUpdatedAt = has(sob, "updatedAt") ? sob.updatedAt : iso(ob.updatedAt);
      if (!same(iso(ob.updatedAt), wantUpdatedAt)) obChanges.push("lastActivity");
      if (obChanges.length) {
        add("Onboarding", "reset", `${P} ${obChanges.join(", ")}`, (tx) =>
          // Raw, because Onboarding.updatedAt is @updatedAt: a Prisma update
          // would stamp it with now() and every account would read as active
          // this second, including the deliberately quiet ones.
          tx.$executeRawUnsafe(
            `UPDATE "Onboarding" SET status = $1, owner = $2, "ownerId" = $3::int,
               "targetGoLive" = $4::timestamptz, "updatedAt" = $5::timestamptz WHERE id = $6::int`,
            sob.status, sob.owner, wantOwnerId, sob.targetGoLive, wantUpdatedAt, ob.id));
      }

      // --- phases: match on name, fall back to slot so a rename is fixable
      const livePhases = [...ob.phases];
      const phaseFor = new Map();
      for (const sp of sob.phases) {
        const i = livePhases.findIndex((lp) => lp.name === sp.name);
        if (i !== -1) phaseFor.set(sp.name, livePhases.splice(i, 1)[0]);
      }
      for (const sp of sob.phases) {
        if (phaseFor.has(sp.name)) continue;
        const i = livePhases.findIndex((lp) => lp.sortOrder === sp.sortOrder);
        if (i !== -1) phaseFor.set(sp.name, livePhases.splice(i, 1)[0]);
      }
      for (const sp of sob.phases) {
        const lp = phaseFor.get(sp.name);
        if (!lp) { skipped.push(`${P}: phase "${sp.name}" is missing. Run --restore --write first.`); continue; }
        const changed = lp.name !== sp.name || lp.sortOrder !== sp.sortOrder ||
          lp.isComplete !== sp.isComplete || !same(iso(lp.targetDate), sp.targetDate);
        if (changed) {
          add("Phase", "reset", `${P} "${lp.name}" → "${sp.name}"`, (tx) =>
            tx.phase.update({
              where: { id: lp.id },
              data: {
                name: sp.name, sortOrder: sp.sortOrder, isComplete: sp.isComplete,
                targetDate: sp.targetDate ? new Date(sp.targetDate) : null,
              },
            }));
        }
      }
      if (livePhases.length) {
        skipped.push(`${P}: ${livePhases.length} extra phase(s) left alone (deleting one cascades its tasks).`);
      }

      // --- contacts -------------------------------------------------------
      const liveContactByEmail = new Map(ob.contacts.map((ct) => [ct.email, ct]));
      const contactIdByEmail = new Map(ob.contacts.map((ct) => [ct.email, ct.id]));
      for (const sct of sob.contacts) {
        const lct = liveContactByEmail.get(sct.email);
        if (!lct) { skipped.push(`${P}: contact ${sct.email} is missing. Run --restore --write first.`); continue; }
        const data = {};
        for (const f of CONTACT_FIELDS) if (has(sct, f) && !same(lct[f], sct[f])) data[f] = sct[f];
        for (const f of ["lastSeenPortalAt", "bouncedAt"]) {
          if (has(sct, f) && !same(iso(lct[f]), sct[f])) data[f] = sct[f] ? new Date(sct[f]) : null;
        }
        if (Object.keys(data).length) {
          add("Contact", "reset", `${P} ${sct.email} (${Object.keys(data).join(", ")})`, (tx) =>
            tx.contact.update({ where: { id: lct.id }, data }));
        }
      }

      // --- tasks ------------------------------------------------------------
      const snapTaskByNumber = new Map(sob.tasks.map((t) => [t.number, t]));
      const liveTaskByNumber = new Map(ob.tasks.map((t) => [t.id, t]).map(([, t]) => [t.number, t]));
      const extraTasks = ob.tasks.filter((t) => !snapTaskByNumber.has(t.number));

      for (const st of sob.tasks) {
        const lt = liveTaskByNumber.get(st.number);
        if (!lt) { skipped.push(`${P}: task ${st.key} is missing. Run --restore --write first.`); continue; }
        const data = {};
        const changes = [];
        for (const f of TASK_FIELDS) {
          if (!has(st, f)) continue;
          const want = f === "owner" ? (st.owner ?? "") : st[f];
          if (!same(lt[f], want)) { data[f] = want; changes.push(f); }
        }
        if (has(st, "members") && JSON.stringify(lt.members ?? []) !== JSON.stringify(st.members ?? [])) {
          data.members = st.members ?? []; changes.push("members");
        }
        if (has(st, "phaseName") && st.phaseName && lt.phase?.name !== st.phaseName) {
          const target = phaseFor.get(st.phaseName);
          if (target) { data.phaseId = target.id; changes.push("phase"); }
        }
        if (has(st, "ownerEmail")) {
          const want = st.ownerEmail == null ? null : vendorByEmail.get(st.ownerEmail) ?? lt.ownerId;
          if (!same(lt.ownerId, want)) { data.ownerId = want; changes.push("ownerId"); }
        }
        if (has(st, "assigneeEmail")) {
          const want = st.assigneeEmail == null ? null : contactIdByEmail.get(st.assigneeEmail) ?? lt.assigneeContactId;
          if (!same(lt.assigneeContactId, want)) { data.assigneeContactId = want; changes.push("assignee"); }
        }
        const wantBlocker = st.blockedByNumber == null ? null : liveTaskByNumber.get(st.blockedByNumber)?.id ?? null;
        if (!same(lt.blockedByTaskId, wantBlocker)) { data.blockedByTaskId = wantBlocker; changes.push("blockedBy"); }

        if (changes.length) {
          const label = changes.includes("status")
            ? `${st.key} status ${lt.status} → ${st.status}`
            : `${st.key} ${changes.join(", ")}`;
          add("Task", "reset", label, (tx) => tx.task.update({ where: { id: lt.id }, data }));
        }
      }
      for (const t of extraTasks) {
        add("Task", "delete", `${taskKey(c.prefix, t.number)} "${t.title.slice(0, 44)}" (not in the snapshot)`,
          (tx) => tx.task.delete({ where: { id: t.id } }));
      }

      // --- drafts ------------------------------------------------------------
      // Only meaningful once the snapshot carries them; before that there is
      // no way to know which resolution was the seeded one.
      if (has(sob, "drafts")) {
        const snapDrafts = new Map(sob.drafts.map((d) => [d.key, d]));
        for (const [key, ld] of K.drafts) {
          const sd = snapDrafts.get(key);
          if (!sd) {
            add("PendingAIChange", "delete", `draft ${ld.action} (created after the baseline)`,
              (tx) => tx.pendingAIChange.delete({ where: { id: ld.id } }));
            continue;
          }
          if (same(ld.status, sd.status) && same(iso(ld.resolvedAt), sd.resolvedAt)) continue;
          add("PendingAIChange", "reset", `draft ${ld.action} ${ld.status} → ${sd.status}`, (tx) =>
            tx.pendingAIChange.update({
              where: { id: ld.id },
              data: {
                status: sd.status,
                resolvedAt: sd.resolvedAt ? new Date(sd.resolvedAt) : null,
                resolvedBy: sd.resolvedAt ? ld.resolvedBy : null,
                rejectedReason: sd.rejectedReason ?? null,
                // The task an approval created is deleted by the task rule
                // above, so the pointer has to go with it.
                appliedTaskId: sd.appliedTaskNumber == null
                  ? null
                  : liveTaskByNumber.get(sd.appliedTaskNumber)?.id ?? null,
              },
            }));
        }
      } else {
        inert.add("drafts");
      }

      // --- rows a visitor added that the snapshot has never heard of --------
      const sweep = (field, table, live, describe, del) => {
        if (!has(sob, field)) { inert.add(field); return; }
        const known = new Set(sob[field].map((r) => r.key ?? r.token));
        for (const [key, row] of live) {
          if (known.has(key)) continue;
          add(table, "delete", `${P} ${describe(row)}`, (tx) => del(tx, row));
        }
      };
      sweep("notifications", "Notification", K.notifications, (n) => `notification ${n.groupKey}`,
        (tx, n) => tx.notification.delete({ where: { id: n.id } }));
      sweep("activity", "ActivityLog", K.activity, (a) => `activity ${a.verb} ${a.entityType}`,
        (tx, a) => tx.activityLog.delete({ where: { id: a.id } }));
      sweep("comments", "Comment", K.comments, (cm) => `comment by ${cm.author}`,
        (tx, cm) => tx.comment.delete({ where: { id: cm.id } }));
      sweep("files", "File", K.files, (f) => `file ${f.fileName}`,
        (tx, f) => tx.file.delete({ where: { id: f.id } }));
      sweep("magicLinks", "MagicLink", K.magicLinks, (m) => `magic link ${m.token.slice(0, 8)}…`,
        (tx, m) => tx.magicLink.delete({ where: { id: m.id } }));

      // --- health -------------------------------------------------------
      health.push({
        prefix: c.prefix,
        status: sob.status,
        now: computeHealth(ob.tasks, { targetGoLive: ob.targetGoLive, createdAt: ob.createdAt }),
        after: computeHealth(sob.tasks, { targetGoLive: sob.targetGoLive, createdAt: sob.createdAt }),
      });
    }
  }

  return { ops, skipped, inert: [...inert], health };
}

/** Delete-then-reset, so a task removed by one rule cannot be updated by another. */
const OP_ORDER = ["delete", "reset"];

function reportRestoreState({ ops, skipped, inert, health }, { only }) {
  const scope = only ? only.join(", ") : "every seeded onboarding";
  console.log(`Restore-state plan for ${scope} (${health.length} onboarding(s))\n`);

  if (!ops.length) console.log("Nothing to put back. The seeded rows already match the snapshot.\n");
  else {
    const byTable = new Map();
    for (const op of ops) {
      const k = `${op.table}|${op.verb}`;
      byTable.set(k, (byTable.get(k) ?? 0) + 1);
    }
    console.log("Rows that change:");
    for (const [k, n] of [...byTable].sort()) {
      const [table, verb] = k.split("|");
      console.log(`   ${String(n).padStart(4)}  ${table.padEnd(16)} ${verb}`);
    }
    console.log("\nDetail:");
    for (const op of ops.slice(0, 60)) console.log(`   ${op.verb === "delete" ? "-" : "~"} ${op.table}: ${op.label}`);
    if (ops.length > 60) console.log(`   … and ${ops.length - 60} more`);
  }

  if (health.length) {
    console.log("\nHealth, now → after the restore:");
    for (const h of health) {
      const flag = h.now.status === h.after.status ? " " : "*";
      console.log(`  ${flag} ${h.prefix.padEnd(5)} ${h.status.padEnd(9)} ${h.now.status.padEnd(9)} → ${h.after.status.padEnd(9)} ${h.after.reasons.join("; ") || "n/a"}`);
    }
    const tally = (pick) => {
      const t = {};
      for (const h of health) if (h.status === "Active") t[pick(h).status] = (t[pick(h).status] ?? 0) + 1;
      return Object.entries(t).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
    };
    console.log(`\n  Active now:   ${tally((h) => h.now)}`);
    console.log(`  Active after: ${tally((h) => h.after)}`);
  }

  if (inert?.length) {
    console.log(`\nNot in the snapshot, so left alone: ${inert.join(", ")}.`);
    console.log("   Re-capture (--capture) to make those categories restorable from tomorrow.");
  }
  if (skipped.length) {
    console.log(`\nSkipped (${skipped.length}):`);
    for (const sk of [...new Set(skipped)].slice(0, 20)) console.log(`   ! ${sk}`);
  }
}

async function restoreState() {
  const snapshot = loadSnapshot();
  const [companies, vendors] = await Promise.all([
    fetchCompanies(),
    prisma.vendorUser.findMany({ select: { id: true, email: true } }),
  ]);
  const plan = planRestoreState(snapshot, companies, {
    only: ONLY,
    vendorByEmail: new Map(vendors.map((v) => [v.email, v.id])),
  });
  reportRestoreState(plan, { only: ONLY });

  if (!WRITE) {
    console.log("\nDRY RUN, nothing written. Add --write to apply.");
    return;
  }

  const ordered = OP_ORDER.flatMap((verb) => plan.ops.filter((op) => op.verb === verb));
  await prisma.$transaction(async (tx) => {
    for (const op of ordered) await op.run(tx);
    // Comments may have gone; the denormalised counter has to follow.
    await tx.$executeRawUnsafe(
      `UPDATE "Task" t SET "commentCount" = (SELECT count(*) FROM "Comment" c WHERE c."taskId" = t.id)
       FROM "Company" co WHERE co.id = t."companyId" AND co."logoUrl" IS NOT NULL
         AND t."commentCount" <> (SELECT count(*) FROM "Comment" c WHERE c."taskId" = t.id)`
    );
  }, { timeout: 120000 });
  console.log(`\nApplied ${ordered.length} change(s). Re-capture when you are happy: --capture`);
}

async function main() {
  if (!MODE) {
    console.error("Usage: demo-snapshot.js (--capture | --check | --restore [--write] | --restore-state [--only PREFIX,…] [--write])");
    process.exit(2);
  }

  if (MODE === "--restore-state") {
    await restoreState();
    await prisma.$disconnect();
    return;
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

// Guarded so the planner can be imported by the unit tests without the CLI
// firing and reaching for the database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
}
