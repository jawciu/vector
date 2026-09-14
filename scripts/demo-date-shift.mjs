/**
 * demo-date-shift.mjs: roll the seeded demo portfolio forward so it always
 * reads as "today".
 *
 * DEMO DATA ONLY. This script rewrites timestamps that a real product would
 * treat as write-once (createdAt, occurredAt, resolvedAt, activity history).
 * It exists because vector.quest is a public demo: the portfolio was seeded
 * with every date computed relative to the run date, and the nightly reseed
 * that kept it fresh was switched off on 2026-07-10 because it destroyed the
 * injected meetings and their AI drafts. Nothing has re-dated the demo since,
 * so go-lives drifted into the past and almost every onboarding aged into
 * "At risk". This shifts the whole corpus by a whole number of days instead,
 * which preserves the seeded calibration exactly: every interval between two
 * demo rows is unchanged, and so is every interval between a demo row and
 * "now".
 *
 *   --dry-run   (default) Print the plan: rows per table, before/after
 *               samples, and the health each onboarding would land on.
 *               Reads only.
 *
 *   --write     Apply the shift in one transaction, drop the cached AI
 *               insights that quote the old dates, and rewrite
 *               prisma/fixtures/demo-snapshot.json with the shifted dates
 *               and a new dateAnchor.
 *
 *   --force     Skip the anchor-skew guard (see below). Last resort.
 *
 * The anchor
 * ----------
 * `dateAnchor` lives in prisma/fixtures/demo-snapshot.json next to
 * capturedAt, and defaults to capturedAt's date when absent. Delta is the
 * number of whole UTC days between the anchor and today. After a --write the
 * anchor becomes today, so a second run the same day is a no-op.
 *
 * That JSON has to be rewritten anyway. The drift check keys onboardings on
 * `prefix|createdAt`, so a shifted database against an unshifted snapshot
 * would report every onboarding as deleted, which is why the anchor lives
 * there too rather than in a table of its own: one artifact, one commit, no
 * migration.
 *
 * The failure mode that buys is a lost commit: the database moves forward,
 * the file does not, and the next run shifts again from the stale anchor.
 * The guard below catches exactly that. Onboarding.createdAt is not editable
 * from the UI, so live and snapshot must agree; if they differ by a constant
 * the previous run's commit went missing, and the script refuses to run.
 *
 * Scope
 * -----
 * The seeded portfolio only: companies with a logoUrl, the same rule
 * demo-snapshot.js uses. The archived legacy corpus (Acme, Globex, …), the
 * auth tables and the AICall cost log are never touched.
 *
 * Rows created after the anchor are visitor activity and organic cron output.
 * They are already recent, so they stay put; only pre-anchor rows move.
 * Timestamps that record something that has happened are clamped at now(),
 * so a seeded draft a visitor approved last week cannot land in the future.
 * Forward-looking dates (targetGoLive, phase targetDate, task due, magic-link
 * expiry) always move the full delta.
 */

import "dotenv/config";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeHealth } from "../lib/health.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(HERE, "../prisma/fixtures/demo-snapshot.json");
const MEETINGS_DIR = join(HERE, "../prisma/fixtures/meetings");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ── pure date maths (unit-tested in demo-date-shift.test.js) ───────────── */

/** Midnight UTC of a Date or ISO string, as epoch ms. */
export function utcMidnight(value) {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole UTC days from `from` to `to`. Negative if `to` is earlier. */
export function daysBetweenUTC(from, to) {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / MS_PER_DAY);
}

/** "2026-07-12T16:10:42.394Z" → "2026-07-12". */
export function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * The anchor for a snapshot: an explicit dateAnchor wins, otherwise the day
 * the snapshot was captured.
 */
export function resolveAnchor(snapshot) {
  const raw = snapshot.dateAnchor ?? snapshot.capturedAt;
  if (!raw) throw new Error("snapshot has neither dateAnchor nor capturedAt");
  return isoDate(raw);
}

/**
 * Shift a "YYYY-MM-DD" due string. Anything else (the demo carries 14 empty
 * ones) is returned untouched. A due date we cannot parse is not ours to
 * invent.
 */
export function shiftDueString(due, days) {
  if (typeof due !== "string" || !DUE_RE.test(due)) return due;
  return new Date(utcMidnight(due) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Shift a full ISO timestamp, preserving time-of-day. Null passes through. */
export function shiftIso(value, days) {
  if (!value) return value;
  return new Date(new Date(value).getTime() + days * MS_PER_DAY).toISOString();
}

/**
 * Shift every date the snapshot holds and re-anchor it. Onboarding keys are
 * `prefix|createdAt`, so they are recomputed rather than shifted as strings.
 */
export function shiftSnapshot(snapshot, days, today) {
  const s = (v) => shiftIso(v, days);
  // Written field by field and defensively: an older snapshot carries fewer
  // collections, and a newer one must not silently leave a date behind.
  const maybe = (rows, fn) => (Array.isArray(rows) ? rows.map(fn) : rows);
  // Child rows (comments, files, activity, notifications, drafts) are matched
  // by demo-snapshot.js on a `key` that EMBEDS iso(createdAt). Shifting the
  // date without the key made every seeded child row look like a visitor
  // addition, and restore-state deleted all of them (2026-09-14). The key is
  // rewritten together with the date, always.
  const withKey = (row, from, to) =>
    typeof row.key === "string" && from && to && from !== to
      ? { ...row, key: row.key.split(from).join(to) }
      : row;
  const shiftRow = (row, fn) => withKey(fn(row), row.createdAt, s(row.createdAt));
  return {
    ...snapshot,
    dateAnchor: today,
    companies: snapshot.companies.map((c) => ({
      ...c,
      onboardings: c.onboardings.map((o) => {
        const createdAt = s(o.createdAt);
        return {
          ...o,
          key: `${c.prefix}|${createdAt}`,
          createdAt,
          updatedAt: s(o.updatedAt),
          targetGoLive: s(o.targetGoLive),
          phases: o.phases.map((p) => ({ ...p, targetDate: s(p.targetDate) })),
          contacts: maybe(o.contacts, (ct) => ({
            ...ct,
            lastSeenPortalAt: s(ct.lastSeenPortalAt),
            bouncedAt: s(ct.bouncedAt),
          })),
          tasks: o.tasks.map((t) => ({ ...t, due: shiftDueString(t.due, days) })),
          comments: maybe(o.comments, (cm) => shiftRow(cm, (r) => ({ ...r, createdAt: s(r.createdAt) }))),
          files: maybe(o.files, (f) => shiftRow(f, (r) => ({ ...r, createdAt: s(r.createdAt) }))),
          magicLinks: maybe(o.magicLinks, (m) => ({
            ...m,
            createdAt: s(m.createdAt),
            expiresAt: s(m.expiresAt),
            revokedAt: s(m.revokedAt),
            lastUsedAt: s(m.lastUsedAt),
            sentAt: s(m.sentAt),
          })),
          activity: maybe(o.activity, (a) => shiftRow(a, (r) => ({ ...r, createdAt: s(r.createdAt) }))),
          notifications: maybe(o.notifications, (n) => shiftRow(n, (r) => ({
            ...r,
            createdAt: s(r.createdAt),
            readAt: s(r.readAt),
            archivedAt: s(r.archivedAt),
          }))),
          drafts: maybe(o.drafts, (d) => shiftRow(d, (r) => ({
            ...r,
            createdAt: s(r.createdAt),
            resolvedAt: s(r.resolvedAt),
          }))),
        };
      }),
    })),
  };
}

/* ── the shift itself ──────────────────────────────────────────────────── */

/** Meeting ids of the demo fixtures: the unmatched events that are ours. */
function fixtureMeetingIds() {
  return readdirSync(MEETINGS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(MEETINGS_DIR, f), "utf8")))
    .map((f) => f.payload?.meeting?.id)
    .filter(Boolean);
}

/**
 * Statements are written with named placeholders and compiled to positional
 * ones, because each touches a different subset of the parameters and
 * Postgres rejects a bind whose count does not match the statement.
 */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function compile(sql, ctx) {
  const used = [];
  const text = sql.replace(PLACEHOLDER, (_, name) => {
    if (!(name in ctx)) throw new Error(`unknown parameter {{${name}}}`);
    let i = used.indexOf(name);
    if (i === -1) i = used.push(name) - 1;
    return `$${i + 1}`;
  });
  return { sql: text, params: used.map((n) => ctx[n]) };
}

/**
 * Every table that carries a date on the seeded corpus, in dependency-free
 * order. `iv` is the interval, `A` the anchor, `OB` / `CO` the demo
 * onboarding and company ids, `FX` the fixture meeting ids.
 */
function statements() {
  const iv = `make_interval(days => {{delta}}::int)`;
  const A = `{{anchor}}::timestamptz`;
  const OB = `{{obIds}}::int[]`;
  const CO = `{{companyIds}}::int[]`;
  const FX = `{{fixtureIds}}::text[]`;

  return [
    {
      table: "Onboarding",
      what: "createdAt, updatedAt, targetGoLive",
      sql: `UPDATE "Onboarding" SET
              "createdAt"    = "createdAt" + ${iv},
              "targetGoLive" = "targetGoLive" + ${iv},
              "updatedAt"    = LEAST("updatedAt" + ${iv}, now())
            WHERE id = ANY(${OB}) AND "createdAt" <= ${A}`,
    },
    {
      // Phase has no createdAt, so it rides on its onboarding's scope.
      table: "Phase",
      what: "targetDate",
      sql: `UPDATE "Phase" SET "targetDate" = "targetDate" + ${iv}
            WHERE "onboardingId" = ANY(${OB}) AND "targetDate" IS NOT NULL`,
    },
    {
      table: "Task",
      what: "due (string), createdAt",
      sql: `UPDATE "Task" SET
              "createdAt" = "createdAt" + ${iv},
              due = CASE WHEN due ~ '^\\d{4}-\\d{2}-\\d{2}$'
                         THEN to_char(due::date + {{delta}}::int, 'YYYY-MM-DD')
                         ELSE due END
            WHERE "companyId" = ANY(${CO}) AND "createdAt" <= ${A}`,
    },
    {
      table: "Comment",
      what: "createdAt",
      sql: `UPDATE "Comment" c SET "createdAt" = c."createdAt" + ${iv}
            FROM "Task" t
            WHERE t.id = c."taskId" AND t."companyId" = ANY(${CO})
              AND c."createdAt" <= ${A}`,
    },
    {
      table: "ActivityLog",
      what: "createdAt",
      sql: `UPDATE "ActivityLog" SET "createdAt" = "createdAt" + ${iv}
            WHERE "onboardingId" = ANY(${OB}) AND "createdAt" <= ${A}`,
    },
    {
      table: "Notification",
      what: "createdAt, readAt, archivedAt",
      sql: `UPDATE "Notification" n SET
              "createdAt"  = n."createdAt" + ${iv},
              "readAt"     = LEAST(n."readAt" + ${iv}, now()),
              "archivedAt" = LEAST(n."archivedAt" + ${iv}, now())
            FROM "ActivityLog" a
            WHERE a.id = n."activityLogId" AND a."onboardingId" = ANY(${OB})
              AND n."createdAt" <= ${A}`,
    },
    {
      // Contact has no created timestamp either, so each column is clamped
      // on its own value.
      table: "Contact",
      what: "lastSeenPortalAt, bouncedAt",
      sql: `UPDATE "Contact" SET
              "lastSeenPortalAt" = CASE WHEN "lastSeenPortalAt" <= ${A}
                                        THEN "lastSeenPortalAt" + ${iv}
                                        ELSE "lastSeenPortalAt" END,
              "bouncedAt"        = CASE WHEN "bouncedAt" <= ${A}
                                        THEN "bouncedAt" + ${iv}
                                        ELSE "bouncedAt" END
            WHERE "onboardingId" = ANY(${OB})
              AND ("lastSeenPortalAt" <= ${A} OR "bouncedAt" <= ${A})`,
    },
    {
      table: "MagicLink",
      what: "createdAt, expiresAt, sentAt, lastUsedAt, revokedAt",
      sql: `UPDATE "MagicLink" SET
              "createdAt"  = "createdAt" + ${iv},
              "expiresAt"  = "expiresAt" + ${iv},
              "sentAt"     = "sentAt" + ${iv},
              "lastUsedAt" = LEAST("lastUsedAt" + ${iv}, now()),
              "revokedAt"  = LEAST("revokedAt" + ${iv}, now())
            WHERE "onboardingId" = ANY(${OB}) AND "createdAt" <= ${A}`,
    },
    {
      table: "File",
      what: "createdAt",
      sql: `UPDATE "File" SET "createdAt" = "createdAt" + ${iv}
            WHERE "onboardingId" = ANY(${OB}) AND "createdAt" <= ${A}`,
    },
    {
      // payload.meeting.date is what the admin pipeline renders and what
      // buildOrchestratorContext reads, so the JSON moves with the columns.
      // Unmatched events are only ours if their meeting id is one of the
      // fixtures, because the legacy Acme test events sit unmatched too.
      table: "ExternalEvent",
      what: "occurredAt, receivedAt, processedAt, payload.meeting.date",
      sql: `UPDATE "ExternalEvent" SET
              "occurredAt"  = "occurredAt" + ${iv},
              "receivedAt"  = "receivedAt" + ${iv},
              "processedAt" = LEAST("processedAt" + ${iv}, now()),
              payload = CASE
                WHEN payload #>> '{meeting,date}' IS NULL THEN payload
                ELSE jsonb_set(payload, '{meeting,date}', to_jsonb(
                  to_char(((payload #>> '{meeting,date}')::timestamptz + ${iv})
                            AT TIME ZONE 'UTC',
                          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
              END
            WHERE "occurredAt" <= ${A}
              AND ("onboardingId" = ANY(${OB})
                   OR (payload #>> '{meeting,id}') = ANY(${FX}))`,
    },
    {
      // dueDate / newDueDate are the only dates a draft holds as data. The
      // prose in a follow-up body ("overdue by 5 days") cannot be shifted.
      // See the open risks in REALISM_PLAN.md. The payload is rebuilt key by
      // key because Postgres allows one assignment per column, and both keys
      // can appear on the same draft.
      table: "PendingAIChange",
      what: "createdAt, resolvedAt, payload.dueDate, payload.newDueDate",
      sql: `UPDATE "PendingAIChange" SET
              "createdAt"  = "createdAt" + ${iv},
              "resolvedAt" = LEAST("resolvedAt" + ${iv}, now()),
              payload = COALESCE((
                SELECT jsonb_object_agg(e.k, CASE
                         WHEN e.k IN ('dueDate','newDueDate')
                          AND (e.v #>> '{}') ~ '^\\d{4}-\\d{2}-\\d{2}$'
                         THEN to_jsonb(to_char((e.v #>> '{}')::date + {{delta}}::int, 'YYYY-MM-DD'))
                         ELSE e.v END)
                FROM jsonb_each(payload) AS e(k, v)
              ), payload)
            WHERE "onboardingId" = ANY(${OB}) AND "createdAt" <= ${A}`,
    },
  ];
}

/**
 * Cached insights quote absolute day counts ("56 days past go-live"), and
 * hashSnapshot() deliberately excludes dates. It hashes overdue task ids,
 * phase states and health, all of which a uniform shift is designed to leave
 * unchanged. So a shifted onboarding can hash identically to its cached row
 * and serve the old prose. Deleting the cache is the only honest option.
 * Cost is near zero: the readers already treat anything older than four hours
 * as stale and regenerate on view.
 */
function insightDeleteSql() {
  return `DELETE FROM "Insight"
          WHERE scope = 'portfolio'
             OR (scope IN ('onboarding','portal') AND "scopeId" = ANY($1::text[]))`;
}

/* ── plumbing ──────────────────────────────────────────────────────────── */

function loadSnapshot() {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  } catch {
    throw new Error(`No snapshot at ${SNAPSHOT_PATH}. Run demo-snapshot.js --capture first.`);
  }
}

/**
 * The database and the snapshot must agree on every onboarding's createdAt.
 * A uniform non-zero skew means a previous --write shifted the data but its
 * snapshot commit never landed.
 */
function anchorSkew(snapshot, liveOnboardings) {
  const byPrefix = new Map();
  for (const o of liveOnboardings) {
    if (!byPrefix.has(o.prefix)) byPrefix.set(o.prefix, []);
    byPrefix.get(o.prefix).push(o);
  }
  const skews = [];
  for (const c of snapshot.companies) {
    for (const o of c.onboardings) {
      const candidates = byPrefix.get(c.prefix) ?? [];
      if (candidates.length !== 1) continue; // ambiguous or deleted, so not a witness
      skews.push(daysBetweenUTC(o.createdAt, candidates[0].createdAt));
    }
  }
  const distinct = [...new Set(skews)];
  return { skews, distinct };
}

function fmt(d) {
  return d ? new Date(d).toISOString().replace("T", " ").slice(0, 16) : "n/a";
}

async function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const FORCE = args.includes("--force");
  if (!WRITE && !args.includes("--dry-run") && args.length > 0 && !FORCE) {
    console.error("Usage: demo-date-shift.mjs [--dry-run | --write] [--force]");
    process.exit(2);
  }

  const snapshot = loadSnapshot();
  const anchor = resolveAnchor(snapshot);
  const today = isoDate(new Date());
  const delta = daysBetweenUTC(anchor, today);

  console.log(`Anchor ${anchor} → today ${today}  (delta ${delta} day${delta === 1 ? "" : "s"})`);

  if (delta === 0) {
    console.log("Nothing to do. The demo is already dated today.");
    return;
  }
  if (delta < 0) {
    console.error(`Refusing to shift backwards. The anchor is in the future; fix dateAnchor in ${SNAPSHOT_PATH}.`);
    process.exit(2);
  }

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../lib/generated/prisma/client.ts");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const companies = await prisma.company.findMany({
      where: { logoUrl: { not: null } },
      select: { id: true, prefix: true, onboardings: { select: { id: true, status: true, createdAt: true, targetGoLive: true } } },
      orderBy: { prefix: "asc" },
    });
    const companyIds = companies.map((c) => c.id);
    const liveOnboardings = companies.flatMap((c) =>
      c.onboardings.map((o) => ({ ...o, prefix: c.prefix }))
    );
    const obIds = liveOnboardings.map((o) => o.id);
    const fixtureIds = fixtureMeetingIds();

    // --- guard -----------------------------------------------------------
    const { distinct } = anchorSkew(snapshot, liveOnboardings);
    if (distinct.length === 1 && distinct[0] !== 0) {
      const msg = `Live onboardings are ${distinct[0]} day(s) ahead of the snapshot. ` +
        `A previous --write shifted the database but its snapshot commit was lost. ` +
        `Set dateAnchor to ${isoDate(new Date(utcMidnight(anchor) + distinct[0] * MS_PER_DAY))} and re-run.`;
      if (!FORCE) { console.error(`\nABORT: ${msg}`); process.exit(3); }
      console.warn(`\nWARNING (--force): ${msg}`);
    } else if (distinct.length > 1) {
      const msg = `Onboarding createdAt values disagree with the snapshot by ${distinct.join("/")} days, which is not a uniform skew.`;
      if (!FORCE) { console.error(`\nABORT: ${msg}`); process.exit(3); }
      console.warn(`\nWARNING (--force): ${msg}`);
    }

    const ctx = {
      delta,
      anchor: new Date(`${anchor}T23:59:59.999Z`),
      obIds,
      companyIds,
      fixtureIds,
    };
    const stmts = statements().map((s) => ({ ...s, ...compile(s.sql, ctx) }));

    // --- plan -------------------------------------------------------------
    console.log(`\nScope: ${companies.length} seeded companies, ${obIds.length} onboardings ` +
      `(logoUrl IS NOT NULL). Legacy and auth rows untouched.`);
    console.log(`Pre-anchor rows only: anything created after ${anchor} is visitor activity and stays put.\n`);

    const insightIds = obIds.map(String);
    const insightCount = await prisma.insight.count({
      where: {
        OR: [
          { scope: "portfolio" },
          { scope: { in: ["onboarding", "portal"] }, scopeId: { in: insightIds } },
        ],
      },
    });

    const before = await sampleRows(prisma, obIds, companyIds, ctx.anchor);

    const rowCounts = await countAffected(prisma, ctx);
    console.log("Rows that move:");
    for (const s of stmts) {
      const n = rowCounts[s.table] ?? 0;
      console.log(`   ${String(n).padStart(4)}  ${s.table.padEnd(16)} ${s.what}`);
    }
    console.log(`   ${String(insightCount).padStart(4)}  ${"Insight".padEnd(16)} DELETED (cached AI prose quotes the old dates)`);

    console.log("\nBefore → after (sample):");
    for (const r of before) {
      console.log(`   ${r.label.padEnd(34)} ${r.before.padEnd(24)} → ${r.after(delta)}`);
    }

    // --- health -----------------------------------------------------------
    await reportHealth(prisma, companies, delta, snapshot);

    if (!WRITE) {
      console.log(`\nDRY RUN, nothing written. Add --write to apply, then commit ${SNAPSHOT_PATH}.`);
      return;
    }

    // --- write ------------------------------------------------------------
    const results = await prisma.$transaction([
      ...stmts.map((s) => prisma.$executeRawUnsafe(s.sql, ...s.params)),
      prisma.$executeRawUnsafe(insightDeleteSql(), insightIds),
    ]);
    stmts.forEach((s, i) => console.log(`   ${String(results[i]).padStart(4)}  ${s.table} updated`));
    console.log(`   ${String(results[results.length - 1]).padStart(4)}  Insight rows deleted`);

    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(shiftSnapshot(snapshot, delta, today), null, 2)}\n`);
    console.log(`\nSnapshot re-anchored to ${today} → ${SNAPSHOT_PATH}`);
    console.log("COMMIT THAT FILE. If it is not committed the next run shifts again from the old anchor.");
  } finally {
    await prisma.$disconnect();
  }
}

/** One count per table, using the same WHERE clauses as the updates. */
async function countAffected(prisma, { anchor, obIds, companyIds, fixtureIds }) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 'Onboarding' t, count(*)::int n FROM "Onboarding" WHERE id = ANY($2::int[]) AND "createdAt" <= $1
     UNION ALL SELECT 'Phase', count(*)::int FROM "Phase" WHERE "onboardingId" = ANY($2::int[]) AND "targetDate" IS NOT NULL
     UNION ALL SELECT 'Task', count(*)::int FROM "Task" WHERE "companyId" = ANY($3::int[]) AND "createdAt" <= $1
     UNION ALL SELECT 'Comment', count(*)::int FROM "Comment" c JOIN "Task" t ON t.id = c."taskId" WHERE t."companyId" = ANY($3::int[]) AND c."createdAt" <= $1
     UNION ALL SELECT 'ActivityLog', count(*)::int FROM "ActivityLog" WHERE "onboardingId" = ANY($2::int[]) AND "createdAt" <= $1
     UNION ALL SELECT 'Notification', count(*)::int FROM "Notification" n JOIN "ActivityLog" a ON a.id = n."activityLogId" WHERE a."onboardingId" = ANY($2::int[]) AND n."createdAt" <= $1
     UNION ALL SELECT 'Contact', count(*)::int FROM "Contact" WHERE "onboardingId" = ANY($2::int[]) AND ("lastSeenPortalAt" <= $1 OR "bouncedAt" <= $1)
     UNION ALL SELECT 'MagicLink', count(*)::int FROM "MagicLink" WHERE "onboardingId" = ANY($2::int[]) AND "createdAt" <= $1
     UNION ALL SELECT 'File', count(*)::int FROM "File" WHERE "onboardingId" = ANY($2::int[]) AND "createdAt" <= $1
     UNION ALL SELECT 'ExternalEvent', count(*)::int FROM "ExternalEvent" WHERE "occurredAt" <= $1 AND ("onboardingId" = ANY($2::int[]) OR (payload #>> '{meeting,id}') = ANY($4::text[]))
     UNION ALL SELECT 'PendingAIChange', count(*)::int FROM "PendingAIChange" WHERE "onboardingId" = ANY($2::int[]) AND "createdAt" <= $1`,
    anchor, obIds, companyIds, fixtureIds
  );
  return Object.fromEntries(rows.map((r) => [r.t, r.n]));
}

/** A handful of representative values, so the plan is checkable by eye. */
async function sampleRows(prisma, obIds, companyIds, anchor) {
  const [ob] = await prisma.$queryRawUnsafe(
    `SELECT c.prefix, o."targetGoLive", o."updatedAt" FROM "Onboarding" o JOIN "Company" c ON c.id = o."companyId"
     WHERE o.id = ANY($1::int[]) AND o.status = 'Active' ORDER BY o."targetGoLive" LIMIT 1`, obIds);
  const [task] = await prisma.$queryRawUnsafe(
    `SELECT c.prefix || '-' || t.number AS id, t.due FROM "Task" t JOIN "Company" c ON c.id = t."companyId"
     WHERE t."companyId" = ANY($1::int[]) AND t.due ~ '^\\d{4}-\\d{2}-\\d{2}$' AND t.status <> 'Done'
     ORDER BY t.due LIMIT 1`, companyIds);
  // Samples are drawn from rows that actually move, i.e. pre-anchor ones.
  const [act] = await prisma.$queryRawUnsafe(
    `SELECT max("createdAt") AS latest FROM "ActivityLog" WHERE "onboardingId" = ANY($1::int[]) AND "createdAt" <= $2`, obIds, anchor);
  const [ev] = await prisma.$queryRawUnsafe(
    `SELECT max("occurredAt") AS latest FROM "ExternalEvent" WHERE "onboardingId" = ANY($1::int[]) AND "occurredAt" <= $2`, obIds, anchor);
  const [seen] = await prisma.$queryRawUnsafe(
    `SELECT max("lastSeenPortalAt") AS latest FROM "Contact" WHERE "onboardingId" = ANY($1::int[]) AND "lastSeenPortalAt" <= $2`, obIds, anchor);

  const iso = (v) => (d) => fmt(new Date(new Date(v).getTime() + d * MS_PER_DAY));
  return [
    { label: `earliest Active go-live (${ob?.prefix})`, before: fmt(ob?.targetGoLive), after: iso(ob?.targetGoLive) },
    { label: `onboarding lastActivity (${ob?.prefix})`, before: fmt(ob?.updatedAt), after: iso(ob?.updatedAt) },
    { label: `earliest open task due (${task?.id})`, before: task?.due ?? "n/a", after: (d) => shiftDueString(task?.due, d) },
    { label: "newest seeded activity entry", before: fmt(act?.latest), after: iso(act?.latest) },
    { label: "newest seeded meeting", before: fmt(ev?.latest), after: iso(ev?.latest) },
    { label: "newest seeded portal visit", before: fmt(seen?.latest), after: iso(seen?.latest) },
  ];
}

/**
 * Run computeHealth over the shifted tasks in memory. This is the check that
 * matters: a pure shift should hand back the calibration the seed was tuned
 * for (7 On track / 3 At risk, Raycast blocked), and anything else means
 * visitors have moved the data since.
 */
async function reportHealth(prisma, companies, delta, snapshot) {
  const rows = await prisma.task.findMany({
    where: { companyId: { in: companies.map((c) => c.id) } },
    select: { onboardingId: true, number: true, status: true, due: true },
  });
  const byOnboarding = new Map();
  for (const t of rows) {
    if (!byOnboarding.has(t.onboardingId)) byOnboarding.set(t.onboardingId, []);
    byOnboarding.get(t.onboardingId).push(t);
  }
  // The snapshot is the seeded calibration: statuses as they were when the
  // portfolio was tuned to 7 On track / 3 At risk. Running the shift over it
  // separates "the shift works" from "visitors have moved the data".
  const seededByPrefix = new Map();
  for (const c of snapshot.companies) {
    if (c.onboardings.length === 1) seededByPrefix.set(c.prefix, c.onboardings[0]);
  }

  const shift = (d) => (d ? new Date(new Date(d).getTime() + delta * MS_PER_DAY) : null);
  const health = (tasks, o) => computeHealth(
    tasks.map((t) => ({ ...t, due: shiftDueString(t.due, delta) })),
    { targetGoLive: shift(o.targetGoLive), createdAt: shift(o.createdAt) }
  );

  console.log("\nHealth per onboarding (live now → live shifted → seeded shifted):");
  const tally = { now: {}, after: {}, seeded: {} };
  for (const c of companies) {
    for (const o of c.onboardings) {
      const tasks = byOnboarding.get(o.id) ?? [];
      const now = computeHealth(tasks, { targetGoLive: o.targetGoLive, createdAt: o.createdAt });
      const after = health(tasks, o);
      const seed = seededByPrefix.get(c.prefix);
      const seeded = seed
        ? health(seed.tasks, { targetGoLive: seed.targetGoLive, createdAt: seed.createdAt })
        : null;

      // How far the live board has drifted from the seeded one.
      const seededStatus = new Map((seed?.tasks ?? []).map((t) => [t.number, t.status]));
      const moved = tasks.filter((t) => seededStatus.has(t.number) && seededStatus.get(t.number) !== t.status).length;

      if (o.status === "Active") {
        tally.now[now.status] = (tally.now[now.status] ?? 0) + 1;
        tally.after[after.status] = (tally.after[after.status] ?? 0) + 1;
        if (seeded) tally.seeded[seeded.status] = (tally.seeded[seeded.status] ?? 0) + 1;
      }
      const flag = seeded && seeded.status !== after.status ? "!" : " ";
      console.log(
        `  ${flag} ${c.prefix.padEnd(5)} ${o.status.padEnd(9)} ${now.status.padEnd(9)} → ${after.status.padEnd(9)} ` +
        `| seeded ${(seeded?.status ?? "n/a").padEnd(9)} | ${String(moved).padStart(2)} task status(es) moved since the snapshot`
      );
      if (after.reasons.length) console.log(`        ${after.reasons.join("; ")}`);
    }
  }
  const line = (t) => Object.entries(t).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
  console.log(`\n  Active onboardings now:            ${line(tally.now)}`);
  console.log(`  Active onboardings after the shift: ${line(tally.after)}`);
  console.log(`  Same shift over the seeded snapshot: ${line(tally.seeded)}`);
  console.log("  (The seeded column IS the calibration. REALISM_PLAN's 7 On track / 3 At risk");
  console.log("   predates the 2026-07-10 diversification that made Raycast Blocked.)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
